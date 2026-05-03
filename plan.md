# Plan — Reportes y estadísticas profesionales

## Contexto

El sistema de domótica ya captura datos ricos en `sensor_data` (hypertable TimescaleDB con compresión a 30 días). Lo que falta es la capa de **agregación + visualización** para que el usuario pueda ver tendencias y tomar decisiones, no solo el último valor.

Hoy:
- `DashboardPage` muestra solo snapshot en vivo (temperatura, batería, contact issues).
- `ActivityPage` es un log SSE crudo.
- Endpoints de stats existentes son solo cuentas planas (`/devices/statistics/organization` → enabled/disabled count).
- No hay charting library en el frontend.

Datos disponibles en `sensor_data.data` (JSONB) — campos estándar de zigbee2mqtt: `temperature`, `humidity`, `pressure`, `illuminance`, `power`, `energy` (kWh acumulado), `voltage`, `current`, `contact`, `occupancy`, `presence`, `vibration`, `smoke`, `water_leak`, `tamper`, `action` (botones), `state`, `brightness`, `color_temp`, `battery`, `linkquality`, `co2`, `voc`, `pm25`, `pm10`, `water_consumed`.

## Decisiones del usuario

| Decisión | Valor |
|---|---|
| Audiencia | Ambos (usuario final + admin/instalador) — construir vistas para ambos |
| Retención histórica | Multi-año (3+) — raw 30d → hourly 1y → daily forever |
| Alcance | Plan completo F1→F5, ejecutar todas las fases |

## Resultado esperado

- Página `/reports` con sub-rutas por categoría (energy/climate/security/devices-health/automations/ai-usage), accesible para usuarios y admins según permisos.
- Página `/devices/:id/details` con timeline completo del dispositivo.
- Export CSV one-click; PDF mensual programado.
- Backend con continuous aggregates eficientes que escalan a años de datos.
- Tablas de auditoría (`RuleExecution`, `CommandExecution`, `AiUsage`) para reportes de automatización e IA.
- Configuración por home: precio kWh, moneda, zonas de confort.

---

## Fases

### Fase 1 — Cimientos de datos (backend)

**Migraciones SQL nuevas en `prisma/migrations/`:**

```sql
-- Continuous aggregate horario
CREATE MATERIALIZED VIEW sensor_hourly
WITH (timescaledb.continuous) AS
SELECT
  device_id,
  time_bucket('1 hour', timestamp) AS bucket,
  avg((data->>'temperature')::float)  FILTER (WHERE data ? 'temperature')   AS temperature_avg,
  min((data->>'temperature')::float)  FILTER (WHERE data ? 'temperature')   AS temperature_min,
  max((data->>'temperature')::float)  FILTER (WHERE data ? 'temperature')   AS temperature_max,
  avg((data->>'humidity')::float)     FILTER (WHERE data ? 'humidity')      AS humidity_avg,
  avg((data->>'pressure')::float)     FILTER (WHERE data ? 'pressure')      AS pressure_avg,
  avg((data->>'illuminance')::float)  FILTER (WHERE data ? 'illuminance')   AS illuminance_avg,
  avg((data->>'power')::float)        FILTER (WHERE data ? 'power')         AS power_avg,
  max((data->>'power')::float)        FILTER (WHERE data ? 'power')         AS power_max,
  max((data->>'energy')::float)       FILTER (WHERE data ? 'energy')        AS energy_max,  -- contador acumulado
  min((data->>'energy')::float)       FILTER (WHERE data ? 'energy')        AS energy_min,
  count(*) FILTER (WHERE (data->>'contact')::boolean = false)               AS contact_open_count,
  count(*) FILTER (WHERE (data->>'occupancy')::boolean = true)              AS occupancy_count,
  count(*) FILTER (WHERE (data->>'presence')::boolean = true)               AS presence_count,
  count(*) FILTER (WHERE (data->>'motion')::boolean = true)                 AS motion_count,
  count(*) FILTER (WHERE (data->>'smoke')::boolean = true)                  AS smoke_count,
  count(*) FILTER (WHERE (data->>'water_leak')::boolean = true)             AS water_leak_count,
  count(*) FILTER (WHERE data ? 'action' AND (data->>'action') <> '')        AS action_count,
  min((data->>'battery')::int)        FILTER (WHERE data ? 'battery')       AS battery_min,
  avg((data->>'linkquality')::int)    FILTER (WHERE data ? 'linkquality')   AS lqi_avg,
  count(*) AS sample_count
FROM sensor_data
GROUP BY device_id, bucket;

SELECT add_continuous_aggregate_policy('sensor_hourly',
  start_offset => INTERVAL '7 days',
  end_offset   => INTERVAL '5 minutes',
  schedule_interval => INTERVAL '5 minutes');

-- Equivalente diario (agregado del horario para queries rápidas multi-mes)
CREATE MATERIALIZED VIEW sensor_daily
WITH (timescaledb.continuous) AS
SELECT
  device_id,
  time_bucket('1 day', bucket) AS bucket,
  avg(temperature_avg) AS temperature_avg,
  min(temperature_min) AS temperature_min,
  max(temperature_max) AS temperature_max,
  avg(humidity_avg) AS humidity_avg,
  avg(power_avg) AS power_avg,
  max(power_max) AS power_max,
  max(energy_max) AS energy_max,
  min(energy_min) AS energy_min,
  sum(contact_open_count) AS contact_open_count,
  sum(occupancy_count) AS occupancy_count,
  sum(motion_count) AS motion_count,
  sum(smoke_count) AS smoke_count,
  sum(water_leak_count) AS water_leak_count,
  sum(action_count) AS action_count,
  min(battery_min) AS battery_min,
  avg(lqi_avg) AS lqi_avg,
  sum(sample_count) AS sample_count
FROM sensor_hourly
GROUP BY device_id, bucket;

SELECT add_continuous_aggregate_policy('sensor_daily',
  start_offset => INTERVAL '30 days',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour');

-- Retention policies para multi-año:
SELECT add_retention_policy('sensor_data', INTERVAL '30 days');     -- raw: 30d
SELECT add_retention_policy('sensor_hourly', INTERVAL '365 days');  -- hourly: 1y
-- sensor_daily: sin retention (se mantiene forever, ~365 filas/device/año)
```

**Módulo NestJS `apps/api/src/reports/`:**
- `reports.controller.ts` con endpoints:
  - `GET /reports/series` — `?device_id=...&metric=temperature|humidity|power|energy|...&from=ISO&to=ISO&bucket=raw|hour|day` → `[{ bucket, value, min?, max?, count? }]`. El service decide qué tabla consultar (raw / sensor_hourly / sensor_daily) según el bucket.
  - `GET /reports/aggregate` — `?device_id=...&from=...&to=...` → totales para todas las métricas relevantes (energy_total_kWh, hours_open, motion_count, time_in_comfort_pct, etc).
  - `GET /reports/multi-series` — series para múltiples devices/métricas en un solo round-trip.
  - `GET /reports/export?...&format=csv` — stream de CSV.
- `reports.service.ts` con queries Prisma `$queryRaw` (continuous aggregates no tienen modelo Prisma; usar SQL directo).
- DTOs en `libs/models/src/reports/`: `ReportSeriesDto`, `ReportAggregateDto`, validación con `class-validator` y enums `ReportMetric` / `ReportBucket`.

**Caching Redis:** decorator simple en `reports.service` que cachea por 60-300s con key `series:{device}:{metric}:{from}:{to}:{bucket}`. Sirve para evitar re-querying cuando varios usuarios miran la misma página.

**Configuración por home:** añadir a `Home`:
```prisma
currency      String  @default("USD") @db.VarChar(3)
kwh_price     Decimal @default(0)     @db.Decimal(8,4)
comfort_min_temp Decimal? @db.Decimal(4,1)
comfort_max_temp Decimal? @db.Decimal(4,1)
```

### Fase 2 — Frontend: charts y componentes base

**Instalación:** `npm install recharts date-fns` en `web/`.

**Componentes nuevos en `web/src/components/charts/`:**
- `<TimeSeriesChart />` — line/area, dark-aware via Tailwind tokens, tooltip custom con formato de unidades.
- `<BarChartCmp />` — barras agrupadas/apiladas.
- `<HeatmapChart />` — 24h × 7d con escala de colores configurable.
- `<KPICard />` — número grande + delta vs período anterior + sparkline mini.
- `<RangeSelector />` — 24h / 7d / 30d / 90d / YTD / custom (date range picker simple).
- `<MetricLegend />` — leyenda con unidades y formato.

**Store `useReportsStore`:**
- Cache LRU (~50 entries) por `(deviceId, metric, range, bucket)` con TTL 60s.
- Acciones: `fetchSeries`, `fetchAggregate`, `fetchExport`, `invalidate`.

### Fase 3 — Páginas de reportes

#### 3.1 `/reports/energy` — Energía y costo
- KPI cards: kWh hoy, este mes, costo $ (usa `home.kwh_price`).
- Top 5 dispositivos consumidores (bar chart).
- Línea de potencia W (en vivo) + área de energía kWh por hora/día.
- Comparativa mes vs. mes anterior con %.
- Footer: export CSV.
- **Truco con `energy`:** es contador acumulado; usar `MAX - MIN` por bucket en lugar de `SUM`.

#### 3.2 `/reports/climate` — Clima y confort
- Por home: línea temperatura + humedad superpuesta (eje Y dual).
- Stats min/max/avg por sensor.
- % del tiempo en zona de confort (configurable en Home settings).
- Heatmap día×hora.
- Multi-device overlay.

#### 3.3 `/reports/security` — Seguridad y actividad
- Apertura de puertas/ventanas: count por día, tiempo total abierta, última apertura.
- Heatmap de movimiento/ocupación.
- Eventos de alarma: smoke, water_leak, vibration, tamper. Log filtrable + KPI "días sin alarma".
- Acciones de botones (`action` enum).

#### 3.4 `/reports/devices-health` — Salud (perfil "admin")
- Batería: lista ordenada ascendente, trend 30d, predicción "X días restantes" (regresión lineal sobre `battery_min`).
- LQI: dispositivos con señal débil sostenida.
- Uptime %: gaps en sensor_data > 5min se cuentan como caídas.
- Top "dispositivos silenciosos" (sin datos en últimas N horas).

#### 3.5 `/reports/automations` — Automatizaciones (perfil "admin")
- Reglas: ejecuciones por día (requiere `RuleExecution` table — ver F5).
- Schedules: timeline de próximas N ejecuciones + log de pasadas.
- Comandos enviados al device por día (requiere `CommandExecution`).

#### 3.6 `/reports/ai-usage` — Uso de IA (perfil "admin")
- Conversaciones del mes, mensajes, tools más usados.
- Tokens consumidos por provider/día.
- Latencia p50/p95.
- Costo estimado por provider.

#### 3.7 `/reports/air-quality` — Calidad del aire (si hay sensores)
- CO2 / VOC / PM2.5 con bandas OMS (verde/amarillo/rojo).
- Heatmap día×hora.

### Fase 4 — Detalle por dispositivo

Página `/devices/:id/details`:
- Header con info del device + estado actual.
- Tabs auto-detectadas según exposes: Climate / Energy / Activity / Health.
- Cada tab usa los componentes de F2 con filtros propios.
- Action panel: enviar comandos (existente).

### Fase 5 — Auditoría y profesionalismo

**Tablas nuevas en Prisma:**
```prisma
model RuleExecution {
  id              String   @id @default(uuid())
  rule_id         String
  rule            Rule     @relation(fields: [rule_id], references: [id], onDelete: Cascade)
  triggered_at    DateTime @default(now()) @db.Timestamptz(6)
  device_id       String?
  conditions_met  Boolean
  executed        Boolean
  results_count   Int      @default(0)
  error           String?  @db.VarChar(1024)
  @@index([rule_id, triggered_at])
  @@index([triggered_at])
}

model CommandExecution {
  id          String   @id @default(uuid())
  user_id     String?
  device_id   String
  device      Device   @relation(fields: [device_id], references: [id], onDelete: Cascade)
  source      String   @db.VarChar(20)  // 'api' | 'ai' | 'rule' | 'schedule'
  command     Json     @db.JsonB
  ok          Boolean
  code        String?  @db.VarChar(40)
  error       String?  @db.VarChar(1024)
  sent_at     DateTime @default(now()) @db.Timestamptz(6)
  @@index([device_id, sent_at])
  @@index([source, sent_at])
}

model AiUsage {
  id                String   @id @default(uuid())
  organization_id   String
  user_id           String
  conversation_id   String
  provider          String   @db.VarChar(20)
  model             String   @db.VarChar(80)
  prompt_tokens     Int      @default(0)
  completion_tokens Int      @default(0)
  total_tokens      Int      @default(0)
  tool_calls        Int      @default(0)
  latency_ms        Int      @default(0)
  error             String?  @db.VarChar(512)
  created_at        DateTime @default(now()) @db.Timestamptz(6)
  @@index([organization_id, created_at])
  @@index([user_id, created_at])
}
```

**Wire-up:**
- `apps/rules-engine/src/rules-engine.service.ts` → escribe `RuleExecution` en cada disparo.
- `apps/mqtt-core/src/mqtt-core.service.ts:publishCommand` → escribe `CommandExecution` (con `source` que viene del payload NATS).
- `apps/ai-service/src/mastra/mastra.service.ts:generateResponse` → captura `result.usage`, `result.toolCalls.length`, latencia y escribe `AiUsage`.

**Export y entrega:**
- `/reports/export?...&format=csv|xlsx` con stream.
- PDF mensual: cron en `apps/init` (o nuevo `apps/scheduler`) que renderiza con Puppeteer y envía vía notification module.
- Compartir vista: persistir filtros en URL.

**Alertas presupuestarias:** nuevo `RuleType: METRIC` que evalúa contra reportes (ej. "kWh del mes > 200"). Encaja en rules-engine actual con un evaluador adicional.

---

## Stack

- **Backend:** Prisma `$queryRaw` para continuous aggregates, NestJS module estándar, Redis cache via decorator.
- **Frontend:** Recharts + date-fns, Tailwind, Zustand para store, Recharts gana sobre Chart.js por DX y dark-mode.
- **DB:** TimescaleDB continuous aggregates + retention policies + compression (ya activa).
- **Caching:** Redis 60-300s para series; el cache se invalida al recibir nuevo dato del device (publish via SSE).

---

## Orden de ejecución

| # | Fase | Esfuerzo | Entregable |
|---|---|---|---|
| 1 | F1 — Migraciones + módulo reports backend | M | Endpoints `/reports/series`, `/aggregate`, `/multi-series` funcionan vía Postman |
| 2 | F2 — Recharts + componentes base | S | Componentes reutilizables en Storybook-like / dev page |
| 3 | F3.1 Energía + 3.2 Clima | M | Páginas usables por homeowner |
| 4 | F4 — Detalle por device | S | Página `/devices/:id/details` |
| 5 | F3.3 Seguridad + 3.4 Devices Health | M | Páginas usables por admin |
| 6 | F5.a — Tablas de auditoría + wire-up | M | Datos persistidos para 3.5/3.6 |
| 7 | F3.5 Automatizaciones + 3.6 IA | S | Páginas admin |
| 8 | F5.b — Export CSV + PDF mensual | M | Reporte profesional offline |
| 9 | F3.7 Air quality + alertas presupuestarias | S | Polish final |

---

## Verificación end-to-end por fase

**F1:** Levantar stack, llamar `GET /reports/series?device_id=X&metric=temperature&from=...&to=...&bucket=hour` → respuesta válida con buckets esperados. Validar que `add_retention_policy` esté activa. Llamar de nuevo en <1s para verificar cache Redis.

**F2:** `npm run build` sin errores. Storybook (o página dev) renderiza cada chart con datos mock.

**F3.x:** Navegar a la URL, ver que los datos coinciden con queries directas en BD. Range selector cambia los datos correctamente. Export CSV abre en Excel.

**F4:** Click en device de la lista → ver tabs auto-detectadas según exposes del device.

**F5:** Ejecutar una regla manualmente → ver entry en `RuleExecution`. Mandar comando via UI → entry en `CommandExecution`. Hablar con AI → entry en `AiUsage`.

---

## Lo que este plan NO cubre

- ML/predicción avanzada (forecast 24h de consumo, anomalías). Posible F6.
- App móvil nativa con widgets de reportes. Posible F7.
- Integración con servicios externos de utility (medidor inteligente del proveedor eléctrico).
- Multi-org dashboards comparativos (el sistema es single-org desde la lente de un usuario).
