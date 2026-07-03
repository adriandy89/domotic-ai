# Plan: Offline-First Híbrido para Domotic AI

> Soluciona que las **reglas dejen de funcionar** cuando la casa del cliente pierde
> conexión a internet. Diseño modular y **opt-in por home** (`home.edge_enabled`), para
> no comprometer hogares con hardware limitado.

---

## 1. Diagnóstico: arquitectura 100% centralizada

Hoy el backend completo corre en un **servidor central** y la casa del cliente (edge)
sólo corre `stack-client` (zigbee2mqtt + opcional zwave/ble/portainer/cloudflared).

### Flujo de datos actual

```
Telemetría : dispositivo → zigbee2mqtt (Zigbee local)
                            → broker TBMQ CENTRAL (por internet)
                            → mqtt-core → NATS → rules-engine
Comandos   : regla → NATS → mqtt-core → publish MQTT → broker central
                            → zigbee2mqtt (por internet) → dispositivo
Conexión   : init consulta la API de sesiones de TBMQ cada minuto
             (apps/init/src/init.service.ts:34); tras 2 fallos → notifica
             desconexión (:294)
```

### Qué falla si la casa pierde internet

| Componente                    | ¿Falla?                     | Por qué                                                                                                                                                        |
| ----------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **zigbee2mqtt**               | No se cae                   | Sigue ejecutándose; la malla Zigbee es local. Sólo pierde la sesión MQTT y entra en bucle de reconexión. Dispositivos con _binds_ directos siguen funcionando. |
| **Reglas event-driven**       | **Sí, dejan de dispararse** | `rules-engine` sólo evalúa cuando llega telemetría (`processNewData` en `rules-engine.service.ts:86`). Sin datos → sin reglas.                                 |
| **Watchdog (STALE/INACTIVE)** | Falsos positivos            | Detecta "dispositivo silencioso" cuando en realidad está desconectado. Dispara alertas erróneas de cuidado.                                                    |
| **Schedules (cron)**          | El comando no llega         | El cron dispara, pero el comando vía MQTT no llega al zigbee2mqtt offline.                                                                                     |
| **Comandos**                  | No se entregan              | El último tramo (broker → zigbee2mqtt) falla.                                                                                                                  |
| **Notificaciones**            | Parcial                     | No hay telemetría que las justifique; sólo el alerta existente de "home disconnected".                                                                         |

---

## 2. Decisiones técnicas (confirmadas)

| Decisión                    | Elección                                                           | Motivo                                                                                             |
| --------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Lenguaje del motor edge     | **NestJS (Node.js)**                                               | Reutiliza el código de evaluación de `rules-engine`; mismo stack ymaintainer.                      |
| Almacenamiento local edge   | **SQLite** (better-sqlite3)                                        | Embebido, sin servidor, robusto para caché de reglas + buffer de logs.                             |
| Sync de reglas central→edge | **MQTT retenido**                                                  | Simple, reutiliza la infraestructura MQTT existente; el edge recibe la última versión al conectar. |
| Broker local edge           | **mosquitto** (Alpine)                                             | Imagen ligera, soporte nativo de bridge store-and-forward.                                         |
| Ámbito de ejecución edge    | **Sólo resultados `COMMAND`** + **schedules** + **watchdog local** | Las notificaciones no se pueden enviar sin internet; se delegan al central al reconectar.          |

---

## 3. Arquitectura objetivo

```
┌─────────────────────────────────────────────────────────────────┐
│  CASA DEL CLIENTE (edge)  — sin internet sigue autónoma          │
│                                                                   │
│   dispositivo ──(Zigbee)──▶ zigbee2mqtt ──▶ mosquitto LOCAL       │
│                                  ▲                 │              │
│                                  │                 │              │
│                                  │          ┌──────▼───────────┐  │
│                                  │          │ edge-rules-engine│  │
│                                  │          │ (NestJS+SQLite)  │  │
│                                  │          │ • event-driven   │  │
│                                  │          │ • watchdog       │  │
│                                  │          │ • schedules      │  │
│                                  │          └──────┬───────────┘  │
│                                  │ (comandos)     │  (telemetría) │
│                                  └────────────────┘              │
│                                                                   │
│   mosquitto ──bridge bidireccional──▶ TBMQ CENTRAL (por internet)│
│            (store-and-forward QoS1: encola si no hay red)         │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  SERVIDOR CENTRAL (sin cambios de flujo)                          │
│   mqtt-core (subscribe home/id/+/+/#) → NATS → rules-engine      │
│   rules-engine: publica bundle de reglas offline (MQTT retenido) │
│                 + ingiere logs edge (POST /api/v1/edge/executions)│
└─────────────────────────────────────────────────────────────────┘
```

**Principio clave:** mosquitto usa los **mismos topics** que zigbee2mqtt usaba directo
contra TBMQ. `mqtt-core` no cambia (sigue suscribiéndose a `home/id/+/+/#` en TBMQ). Sólo
cambia quién habla con TBMQ desde la casa: el bridge en vez de zigbee2mqtt directo.

---

## 4. Componentes a crear / modificar

### 4.1 Nuevo: `libs/rules-evaluator`

Lógica de evaluación **pura** (sin Prisma/Redis/NATS), extraída del `rules-engine` actual:

- `evaluateCondition(condition, value)` + coerción numérica de strings
- `evaluateRule(rule, currentDeviceId, newData, prevData, otherDevicesData)`
- `isWithinExecutionWindow(rule, now, timezone)`
- `buildCommandUnified(result)`

Consumidores: `rules-engine` central (refactor para delegar) y `apps/edge-rules-engine`.

### 4.2 Nuevo: `stack-client/edge/`

```text
stack-client/edge/
├── docker-compose.yml          # mosquitto + edge-rules-engine (opt-in)
├── mosquitto/
│   ├── mosquitto.conf          # bridge bidireccional a TBMQ + persistencia
│   └── passwords               # credenciales locales (generadas por home)
├── edge-rules-data/            # volumen: SQLite + config del home
└── README.md
```

### 4.3 Nuevo: `apps/edge-rules-engine`

NestJS **standalone** (sin Postgres/Redis/NATS). Sólo MQTT (mosquitto local) + SQLite.

```
apps/edge-rules-engine/src/
├── main.ts                          # arranca: MQTT local + carga SQLite
├── edge-rules.module.ts
├── sync/
│   ├── rules-sync.service.ts        # suscribe home/id/{uuid}/edge/rules (retained)
│   └── rules-sync.types.ts
├── ingest/
│   ├── mqtt-ingest.service.ts       # suscribe telemetría local
│   └── ingest.controller.ts
├── engine/
│   ├── engine.service.ts            # reusa libs/rules-evaluator
│   ├── watchdog.service.ts          # STALE/INACTIVE local (cron)
│   └── schedules.service.ts         # schedules run_offline (cron)
├── store/
│   ├── sqlite.service.ts            # better-sqlite3 wrapper
│   └── schema.sql                   # rules_cache, executions_buffer, kv
└── upload/
    └── executions-uploader.service.ts  # POST batches al reconectar
```

### 4.4 Modificaciones central

| Archivo                              | Cambio                                                                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`               | `Rule.run_offline Boolean @default(false)`, `Schedule.run_offline Boolean @default(false)`, `Home.edge_enabled Boolean @default(false)` |
| `apps/rules-engine/src/...`          | Publicar bundle offline a `home/id/{uuid}/edge/rules` (retenido, firmado) cuando cambia una regla `run_offline`                         |
| `apps/rules-engine/src/...`          | Schedules: si `home.edge_enabled` y home desconectada → saltar (evita doble ejecución)                                                  |
| `apps/rules-engine/src/watchdog/...` | Silenciar watchdog central para homes `edge_enabled` (evita duplicar el local)                                                          |
| `apps/api/src/...`                   | `POST /api/v1/edge/executions` (ingest batches + dedup), `GET /api/v1/edge/rules/:homeUniqueId` (bundle pull alternativo)               |
| `apps/mqtt-core/src/...`             | Opcional: enrutar telemetría `backfilled` a auditoría sin disparar reglas                                                               |
| `web/src/...`                        | Toggle "Ejecutar sin conexión" en editor de reglas/schedules (visible si `home.edge_enabled`)                                           |

---

## 5. docker-compose del motor edge (NestJS + SQLite)

> `stack-client/edge/docker-compose.yml`

```yaml
name: edge

# Stack edge opt-in: broker MQTT local + motor de reglas autónomo.
# Se despliega sólo en homes con `edge_enabled = true`.
# Requiere los valores por-home desde el dashboard → Integraciones → Edge.

services:
  # ───────────────────────────────────────────────────────────────
  # Broker MQTT local (ligero, Alpine). zigbee2mqtt publica aquí.
  # Bridge bidireccional store-and-forward hacia TBMQ central.
  # ───────────────────────────────────────────────────────────────
  mosquitto:
    image: eclipse-mosquitto:2-openssl
    container_name: mosquitto
    restart: always
    volumes:
      - ./mosquitto/mosquitto.conf:/mosquitto/config/mosquitto.conf:ro
      - ./mosquitto/passwords:/mosquitto/config/passwords:ro
      - mosquitto-data:/mosquitto/data
      - mosquitto-log:/mosquitto/log
    ports:
      - '1883:1883' # MQTT local (zigbee2mqtt, edge-rules-engine)
    networks:
      - edge

  # ───────────────────────────────────────────────────────────────
  # Motor de reglas edge (NestJS standalone).
  # Sin Postgres/Redis/NATS: sólo MQTT local + SQLite embebido.
  # Ejecuta reglas marcadas `run_offline` cuando no hay internet.
  # ───────────────────────────────────────────────────────────────
  edge-rules-engine:
    build:
      context: ../../.. # raíz del repo (mono-repo NestJS)
      dockerfile: apps/edge-rules-engine/Dockerfile
      args:
        - SERVICE_NAME=edge-rules-engine
    container_name: edge-rules-engine
    restart: always
    depends_on:
      - mosquitto
    environment:
      - TZ=Europe/Madrid
      # Conexión al broker MQTT LOCAL:
      - MQTT_SERVER_BASE=mqtt://mosquitto
      - MQTT_PORT=1883
      - MQTT_USERNAME=${EDGE_MQTT_USER}
      - MQTT_PASSWORD=${EDGE_MQTT_PASS}
      - MQTT_CLIENT_ID=${HOME_UNIQUE_ID}-edge-rules
      # Identidad del home (mismo unique_id que el resto de bridges):
      - HOME_UNIQUE_ID=${HOME_UNIQUE_ID}
      - ORGANIZATION_ID=${ORGANIZATION_ID}
      # Sync de reglas vía MQTT retenido (recibe bundle al conectar):
      - RULES_SYNC_TOPIC=home/id/${HOME_UNIQUE_ID}/edge/rules
      # Subida de logs al reconectar (central):
      - CENTRAL_API_URL=${CENTRAL_API_URL}
      - EDGE_AUTH_TOKEN=${EDGE_AUTH_TOKEN}
      # SQLite embebido:
      - SQLITE_PATH=/data/edge.db
      # Watchdog local:
      - WATCHDOG_INTERVAL_SECONDS=300
    volumes:
      - edge-rules-data:/data
    networks:
      - edge

volumes:
  mosquitto-data:
  mosquitto-log:
  edge-rules-data:

networks:
  edge:
    name: edge
```

### `mosquitto/mosquitto.conf` (extracto)

```text
# ── Listener local ───────────────────────────────────────────────
persistence true
persistence_location /mosquitto/data/
log_dest file /mosquitto/log/mosquitto.log
allow_anonymous false
password_file /mosquitto/config/passwords
listener 1883

# ── Bridge bidireccional store-and-forward a TBMQ central ────────
connection central-bridge
address your-tbmq-server.com:1883
remote_username HOME_UNIQUE_ID
remote_password HOME_MQTT_PASSWORD
remote_clientid HOME_UNIQUE_ID-bridge
# Mismos topics que zigbee2mqtt usaba directo: telemetría sube, comandos bajan
topic home/id/HOME_UNIQUE_ID/# both 1
# Persistencia del bridge: encola mientras no hay internet
try_private false
start_type automatic
restart_timeout 5 30
cleansession false
max_queued_messages 100000
max_inflight_messages 0
# QoS de la cola
bridge_qos 1
local_cleansession false
```

> Sustituir `HOME_UNIQUE_ID` / `HOME_MQTT_PASSWORD` por los valores por-home
> (mismos que usa zigbee2mqtt). Generar passwords locales con
> `mosquitto_passwd -c passwords EDGE_MQTT_USER`.

### `apps/edge-rules-engine/Dockerfile` (multi-stage NestJS)

```dockerfile
# ── build ──
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY libs ./libs
COPY apps/edge-rules-engine ./apps/edge-rules-engine
COPY generated ./generated
RUN pnpm install --frozen-lockfile
RUN pnpm exec nest build edge-rules-engine

# ── runtime (mejor-sqlite3 necesita rebuild nativo) ──
FROM node:20-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
# better-sqlite3 native:
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && pnpm rebuild better-sqlite3 \
    && apt-get purge -y python3 make g++ && apt-get autoremove -y
CMD ["node", "dist/apps/edge-rules-engine/main.js"]
```

---

## 6. Sync y deduplicación

### Sync de reglas (central → edge) — MQTT retenido, simple

1. `rules-engine` serializa las reglas con `run_offline = true` del home (sólo
   condiciones + resultados `COMMAND`; sin notificaciones).
2. Publica a `home/id/{uuid}/edge/rules` con **retain=true** + QoS1 (payload firmado
   con HMAC del `EDGE_AUTH_TOKEN` para integridad).
3. El edge suscribe ese topic en mosquitto local (lo recibe vía el bridge, retained =
   última versión siempre disponible, incluso tras un reinicio del edge).
4. El edge persiste el bundle en SQLite (`rules_cache`) y trabaja desde ahí.

**Trigger de re-publicación:** cada vez que una regla/schedule `run_offline` se
crea/edita/borra, o `home.edge_enabled` cambia.

### Logs de ejecución (edge → central) — buffered upload

1. Cada ejecución local se inserta en `executions_buffer` (SQLite) con un
   **dedup key** = `sha256(ruleId + deviceId + attribute + value + minuto)`.
2. Un uploader (cron cada N s) intenta `POST /api/v1/edge/executions` con los pendientes
   cuando hay conectividad (el bridge MQTT levanta implica internet arriba).
3. El central inserta los logs, marca el dedup key en una cache Redis TTL 24h, y
   responde `200 + ids ACEPTADOS / ids DUPLICADOS`.
4. El edge elimina de su buffer sólo los ACEPTADOS.

### Deduplicación central al procesar telemetría backfillada

- Cuando la telemetría encolada por el bridge llega a `mqtt-core` (tras reconexión),
  `rules-engine` consulta la cache de dedup keys antes de ejecutar; si la regla ya
  actuó el edge, **salta** esa combinación.
- Alternativa/refuerzo: el bridge marca mensajes reenviados con
  `backfilled: true` (property MQTT5); `mqtt-core` enruta esos a auditoría sin
  disparar reglas event-driven (los schedules/watchdog locales ya actuaron).

---

## 7. Cambios de comportamiento por home

| `home.edge_enabled`       | Comportamiento                                                                                                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `false` (default, actual) | Sin cambios. Todo central. zigbee2mqtt → TBMQ directo.                                                                                                                                                               |
| `true`                    | Despliegue del stack `stack-client/edge/`. zigbee2mqtt repuntado a mosquitto local. Reglas/schedules con `run_offline` se ejecutan localmente. Central silencia su watchdog y salta schedules offline para esa home. |

**Migración de hogar existente:** repuntar zigbee2mqtt (`configuration.yaml.mqtt.server`)
de TBMQ directo al mosquitto local. El `unique_id`/credenciales se reutilizan para el
bridge. Documentar en `stack-client/edge/README.md`.

---

## 8. Riesgos y mitigaciones

1. **Repuntar zigbee2mqtt al broker local** cambia la instalación existente → migración
   documentada y reversible por home.
2. **Sesión persistente en TBMQ** para el client_id `{uuid}-bridge` debe estar habilitada
   o el store-and-forward no funciona (verificar config TBMQ).
3. **Reloj del edge**: schedules locales dependen del reloj del equipo (NTP). Sin
   internet el reloz puede derivar; recomendar NTP local oChrony.
4. **Doble ejecución de schedules**: el central TAMBIÉN los ejecuta → el schedule debe
   "migrarse" al edge, no duplicarse. El central salta schedules `run_offline` si
   `home.edge_enabled` y la home está desconectada (hay detección en
   `init.service.ts:34`).
5. **Watchdog central vs edge**: cuando el edge toma el control, el central silencia su
   watchdog para esa home (evita alertas duplicadas/contradictorias).
6. **Hardware limitado**: imágenes Alpine/multistage; SQLite embebido (sin servidor);
   el edge es opt-in por home para no forzar recursos.
7. **Seguridad del bundle**: firmar HMAC el payload de reglas retenido; el
   `EDGE_AUTH_TOKEN` (vinculado al `unique_id`) autentica la subida de logs.

---

## 9. Fases de implementación (orden recomendado)

| Fase  | Qué                                                                                              | Valor                                                         | Riesgo |
| ----- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | ------ |
| **0** | `libs/rules-evaluator`: extraer lógica pura de evaluación. `rules-engine` refactor para delegar. | Base limpia reusable                                          | Bajo   |
| **1** | `stack-client/edge/mosquitto` + bridge bidireccional. Repuntar zigbee2mqtt.                      | Buffering de telemetría (store-and-forward) ya sin motor edge | Medio  |
| **2** | Modelo Prisma: `run_offline` (Rule/Schedule) + `edge_enabled` (Home) + migración.                | Habilita las siguientes                                       | Bajo   |
| **3** | `apps/edge-rules-engine` mínimo: ingest MQTT local + evaluación event-driven + SQLite.           | Núcleo de autonomía offline (COMMANDs)                        | Medio  |
| **4** | Sync de reglas (MQTT retenido) + schedules + watchdog local en el edge.                          | Cobertura completa offline                                    | Medio  |
| **5** | Deduplicación: `POST /api/v1/edge/executions`, cache dedup, salto en central.                    | Cierre del círculo (sin dobles ejecuciones)                   | Medio  |
| **6** | UI (toggle "Ejecutar sin conexión"), templates edge en dashboard, docs.                          | Experiencia + despliegue                                      | Bajo   |

---

## 10. Qué funciona offline (y qué no)

| Funcionalidad                                  | Offline (sin internet)                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Reglas `run_offline` con resultado **COMMAND** | **Sí** — ejecuta local                                                                   |
| Schedules `run_offline`                        | **Sí** — cron local                                                                      |
| Watchdog (cuidado/ausencia)                    | **Sí** — mejor que el central (sin falsos positivos por corte)                           |
| Control manual desde dashboard                 | No (requiere backend)                                                                    |
| Notificaciones (Telegram/email)                | No (sin internet); se descartan localmente, el central notifica al reconectar si procede |
| IA / asistente                                 | No (requiere backend)                                                                    |
| Telemetría histórica                           | No en tiempo real; llega buffered al reconectar                                          |
