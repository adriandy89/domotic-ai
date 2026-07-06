# Plan: Integrar Amazon Alexa (Smart Home Skill) en Domotic-AI

## Contexto

El usuario quiere control por voz nativo de sus dispositivos a través de Alexa
("Alexa, enciende la luz del salón"). La exploración confirma que **la parte
difícil ya está resuelta y es reutilizable**:

- El **modelo de capacidades agnóstico al protocolo** (`DeviceAction` /
  `DeviceReadableAttribute` en [types.ts](libs/models/src/device/protocols/types.ts))
  mapea limpiamente a las interfaces de Alexa (PowerController, BrightnessController,
  ColorController, ThermostatController, LockController…).
- El **punto único de ejecución de comandos** (`executeOneCommand` en
  [send-device-command.tool.ts](libs/ai-tools/src/tools/send-device-command.tool.ts)
  → NATS `mqtt-core.publish-command` →
  [device-command.service.ts](apps/mqtt-core/src/services/device-command.service.ts))
  ya valida, normaliza (incluye hex→xy/hs/rgb y Kelvin→mireds), limita tasa (2/s) y
  audita. Alexa será una **cuarta fuente de comandos** junto a api/ai/rule/schedule.
- El **estado actual** está en `SensorDataLast.data` y la disponibilidad en
  `Device.online`.

**Lo único genuinamente nuevo** que Alexa obliga a construir, y que hoy **no existe**:
1. Un **servidor de autorización OAuth2** para el *account linking* (la plataforma
   hoy es solo *cliente* OAuth de login social; no hay `/authorize` ni `/token`).
2. Un **endpoint que reciba las directivas de Alexa**. Las Smart Home Skills exigen
   un **AWS Lambda** como endpoint; el Lambda será un simple proxy hacia la nube.

**Decisiones tomadas:** Smart Home Skill nativa · servidor OAuth2 propio en `apps/api`
· reporte proactivo diferido a v2 (v1 usa respuesta síncrona + `ReportState` por sondeo).

Precedentes estructurales a imitar: el servidor MCP "Domotica"
([apps/api/src/mcp/](apps/api/src/mcp/)) y el puente Xiaozhi
([apps/api/src/integrations/xiaozhi/](apps/api/src/integrations/xiaozhi/)).

---

## Fase A — Servidor OAuth2 de account linking (`apps/api/src/alexa/oauth/`)

**Decisión de librería:** hand-roll minimalista (solo 2 grants: `authorization_code`
y `refresh_token`), replicando el patrón de
[mcp-token.service.ts](apps/api/src/mcp/mcp-token.service.ts) (secreto aleatorio →
hash SHA-256 en BD → resolver `{userId, organizationId, role}`). Es ~150 líneas y evita
acoplar `@node-oauth/oauth2-server` al monorepo. (Escape hatch documentado: esa librería
si en el futuro se quiere RFC 6749 completo.)

### Modelos Prisma (añadir a [schema.prisma](prisma/schema.prisma))

```prisma
model AlexaOAuthClient {          // el "cliente" Amazon (una skill por org)
  id String @id @default(uuid())
  client_id String @unique @db.VarChar(128)
  client_secret_hash String @db.VarChar(64)   // sha256, como McpToken
  name String @db.VarChar(80)
  organization_id String
  redirect_uris String[]                        // allowlist de Alexa (layla/pitangui/…)
  disabled Boolean @default(false)
  created_at DateTime @default(now()) @db.Timestamptz(6)
  updated_at DateTime? @updatedAt @db.Timestamptz(6)
  @@index([organization_id]) @@map("alexa_oauth_clients")
}
model AlexaAuthCode {             // código de un solo uso, ~10 min
  code_hash String @id @db.VarChar(64)
  client_id String @db.VarChar(128)
  user_id String  // FK User onDelete: Cascade
  redirect_uri String @db.Text
  scope String? @db.VarChar(256)
  code_challenge String? @db.VarChar(128)      // seam PKCE (App-to-App); web linking usa secret
  code_challenge_method String? @db.VarChar(10)
  expires_at DateTime @db.Timestamptz(6)
  consumed_at DateTime? @db.Timestamptz(6)     // guard single-use
  created_at DateTime @default(now()) @db.Timestamptz(6)
  @@index([user_id]) @@index([expires_at]) @@map("alexa_auth_codes")
}
model AlexaAccessToken {          // ~1 h; Alexa refresca
  token_hash String @id @db.VarChar(64)
  client_id String @db.VarChar(128)
  user_id String  // FK User
  scope String? @db.VarChar(256)
  expires_at DateTime @db.Timestamptz(6)
  created_at DateTime @default(now()) @db.Timestamptz(6)
  @@index([user_id]) @@index([expires_at]) @@map("alexa_access_tokens")
}
model AlexaRefreshToken {         // "linked" = existe uno no revocado para el user
  token_hash String @id @db.VarChar(64)
  client_id String @db.VarChar(128)
  user_id String  // FK User
  scope String? @db.VarChar(256)
  revoked_at DateTime? @db.Timestamptz(6)
  last_used_at DateTime? @db.Timestamptz(6)
  created_at DateTime @default(now()) @db.Timestamptz(6)
  @@index([user_id]) @@map("alexa_refresh_tokens")
}
```
Añadir back-relations en `User`. El estado "vinculado" es **derivado** (no hace falta
tabla de integración aparte).

### Endpoints ([alexa-oauth.controller.ts](apps/api/src/alexa/oauth/alexa-oauth.controller.ts), `@Controller('alexa/oauth')`)

- **`GET /authorize`** (navegador, **sin bearer**, reutiliza la cookie de sesión
  `domotic.sh`). Valida `client_id`, `redirect_uri` ∈ allowlist, `response_type=code`,
  `state`/`scope`. Si `req.isAuthenticated()` → página de consentimiento HTML renderizada
  en servidor (`res.type('html').send(...)`, como el blurb del MCP; sin acoplar el build
  de la SPA). Si no → `302` a `${PUBLIC_APP_URL}/login?next=<authorize-url>` (pequeño
  cambio en la SPA de login + callbacks de [auth.controller.ts](apps/api/src/auth/auth.controller.ts)
  para honrar `next`, que hoy hardcodean `redirect('/')`).
- **`POST /authorize/decision`** (con `AuthenticatedGuard`): al "Permitir", emite el
  auth code (guarda solo el `sha256`), `302` a `redirect_uri?code=…&state=…`.
- **`POST /token`** (**sin bearer**; auth de cliente por HTTP Basic **o** body;
  acepta `x-www-form-urlencoded` —formato de Alexa— y JSON). Grants:
  `authorization_code` (verifica secret timing-safe, code no expirado/no consumido,
  redirect_uri coincide → emite access+refresh) y `refresh_token` (rota el refresh,
  recomendado). Devuelve `{access_token, token_type:"bearer", expires_in:3600, refresh_token}`.
  Errores OAuth (`{error:"invalid_grant"}`) con su código HTTP. **Nunca loguear tokens
  crudos** (solo prefijos, como McpToken).

### Auth del endpoint de directivas
- [alexa-token.service.ts](apps/api/src/alexa/alexa-token.service.ts) — `authenticate(bearer)`
  → `{userId, organizationId, role}`, casi verbatim de `McpTokenService.authenticate`
  (sha256 → lookup `AlexaAccessToken` → rechaza si expirado/inactivo).
- [alexa-auth.middleware.ts](apps/api/src/alexa/alexa-auth.middleware.ts) — imita
  [mcp-auth.middleware.ts](apps/api/src/mcp/mcp-auth.middleware.ts): setea
  `req.alexa = {userId, organizationId, role}` o responde el error de Alexa
  `INVALID_AUTHORIZATION_CREDENTIAL`.

### Provisión del cliente (admin)
`AlexaOAuthClientService.create(orgId, name, redirectUris)` — imita `McpTokenService.create`:
`client_id` aleatorio, `client_secret` mostrado **una sola vez**, `client_secret_hash`
en BD. Se expone en la card de ajustes (Fase C).

---

## Fase B — Endpoint de directivas, Lambda proxy y mapeo de capabilities

### Lambda proxy (nuevo top-level `alexa-lambda/`)
Las Smart Home Skills **solo** admiten un ARN de Lambda como endpoint (HTTPS directo es
solo para skills *custom*). Diseño: `alexa-lambda/index.mjs` sin dependencias (runtime
Node 20/22, `fetch` global) que (1) extrae el bearer de `directive.endpoint.scope.token`
(control/ReportState) o `directive.payload.scope.token` (Discovery), (2) hace `POST` del
**JSON de la directiva tal cual** a `${PUBLIC_APP_URL}/api/v1/alexa/directives` con
`Authorization: Bearer`, (3) devuelve la respuesta verbatim. **Toda la lógica vive en
`apps/api`**; el Lambda no mapea nada y casi nunca se redespliega. La nube es alcanzable
por el Cloudflare Tunnel existente (`PUBLIC_APP_URL`).

### Módulo `apps/api/src/alexa/`
```
alexa.module.ts                 // registra middleware en POST 'alexa/directives'
directives/
  alexa-directive.controller.ts // @Post('directives'); @Body() crudo (SIN DTO: el
                                 //   ValidationPipe global no debe stripear campos Alexa,
                                 //   igual que McpController usa @Req/@Res)
  alexa-directive.router.ts      // switch por header.namespace/name
  {discovery,power,brightness,color,color-temperature,thermostat,lock,scene,report-state}.handler.ts
mapping/
  capability-mapper.ts           // DeviceAction[]/readable[] -> {displayCategories, capabilities}
  directive-to-command.ts        // directiva Alexa -> {property:value} -> executeOneCommand
  alexa-display-category.ts      // inferencia de tipo (espejo de web/src/lib/device-capabilities.ts)
  alexa-response.ts              // builders de envelope/context.properties/error
  alexa.types.ts                 // tipos de directiva/evento; codec de endpointId
```
Registrar `AlexaModule` en [app.module.ts](apps/api/src/app.module.ts). El wiring del
middleware imita `McpModule.configure`.

### Codec de `endpointId` (resolución stateless)
- Dispositivo normal → `dev:<device.uuid>`.
- Comando IR aprendido → `ir:<learnedCommand.uuid>` (cada código IR = su propio endpoint
  `SceneController`).
Control/ReportState decodifican el prefijo, cargan la fila (scoping por `organizationId`
+ `UserHome`) y **re-derivan** `getAvailableActions()` — sin binding almacenado, igual de
stateless que `executeOneCommand`.

### Discovery — enumerar → mapear
Consulta los dispositivos del user vinculado:
`Device where organization_id = req.alexa.organizationId AND home.users.some(user_id = req.alexa.userId) AND disabled=false`
(patrón `UserHome` ya usado en [learned-ir-commands.tool.ts](libs/ai-tools/src/tools/learned-ir-commands.tool.ts)).
Por dispositivo: `getAdapter(protocol).getAvailableActions/getReadableAttributes` → mapper.
Además enumera `DeviceLearnedCommands` → un endpoint `SceneController` por código IR.
Cada endpoint anuncia también `Alexa` (v3) y `Alexa.EndpointHealth` (de `Device.online`).

### Tabla de mapeo — Discovery (capability platform → Alexa)

| Capability detectada (property, tipo) | Interfaz Alexa | property | retrievable | Nota |
|---|---|---|---|---|
| binary on/off (`state`, o media `power`) | `PowerController` | powerState | sí | valueOn/valueOff del action |
| numeric `brightness` (0–valueMax≈254) | `BrightnessController` | brightness (0–100) | sí | escalar 0–254↔0–100 |
| `color` (type color, colorFormats) | `ColorController` | color (HSB) | sí | Alexa HSB→hex→`{color:{hex}}`; el adapter convierte |
| numeric `color_temp` (mireds) | `ColorTemperatureController` | colorTemperatureInKelvin | sí | **pasar Kelvin directo** a `{color_temp:K}`; auto-convierte |
| enum `system_mode` + setpoint numérico | `ThermostatController` | targetSetpoint, thermostatMode | sí | modos → enum `values[]` (HEAT/COOL/AUTO/OFF/ECO) |
| readable numeric `temperature` | `TemperatureSensor` | temperature | sí | con thermostat o suelto |
| binary lock (LOCK/UNLOCK) | `LockController` | lockState | sí | report LOCKED/UNLOCKED/JAMMED |
| readable binary `contact` | `ContactSensor` | detectionState | sí | |
| readable binary `occupancy`/`presence` | `MotionSensor` | detectionState | sí | |
| fila `DeviceLearnedCommands` (IR) | `SceneController` | — | n/a | `supportsDeactivation:false` |
| cualquier endpoint | `EndpointHealth` | connectivity | sí | de `Device.online` |
| `humidity`, cover `position`, enums genéricos | (diferir a v-next) | — | — | `RangeController`/`ModeController`/`ToggleController` |

**`displayCategories`** (`alexa-display-category.ts`, espejo de `getDeviceIcon`/`isMediaDevice`
en [device-capabilities.ts](web/src/lib/device-capabilities.ts)): media(power+volume+input)→`TV`;
state+brightness/color→`LIGHT`; state+energy→`SMARTPLUG`; solo state→`SWITCH`; thermostat→
`THERMOSTAT`+`TEMPERATURE_SENSOR`; lock→`SMARTLOCK`; contact→`CONTACT_SENSOR`;
occupancy→`MOTION_SENSOR`; IR→`SCENE_TRIGGER`; fallback→`OTHER`.

### Tabla de mapeo — Control (directiva → comando → `executeOneCommand`)

| Directiva Alexa | Comando construido | Nota |
|---|---|---|
| `PowerController.TurnOn/Off` | `{ <onoff>: valueOn/valueOff }` | resuelve el binary action en runtime |
| `BrightnessController.SetBrightness(0–100)` | `{ brightness: round(v/100*valueMax) }` | — |
| `BrightnessController.AdjustBrightness(±Δ)` | leer `SensorDataLast.data.brightness`, sumar, clamp | requiere estado actual |
| `ColorController.SetColor{h,s,b}` | HSB→`#RRGGBB` → `{ color:{hex} }` | el adapter finaliza |
| `ColorTemperatureController.SetColorTemperature(K)` | `{ color_temp: K }` | auto-convierte K→mireds |
| `ThermostatController.SetTargetTemperature` | `{ <setpoint>: value }` | — |
| `ThermostatController.SetThermostatMode` | `{ system_mode: enumMapeado }` | map a `values[]` |
| `LockController.Lock/Unlock` | `{ <lock>: LOCK/UNLOCK }` | — |
| `SceneController.Activate` (IR) | `executeOneCommand(deviceId, { ir_code_to_send: command })` | verbatim de `sendLearnedIrCommandTool` |

Todos los paths no-IR llaman a `executeOneCommand({dbService, natsClient, organizationId, userId}, deviceId, command)` (import de `@app/ai-tools`; o replicar sus ~30 líneas para no arrastrar `@mastra/core`).

### Correctitud async
El handler responde **síncronamente** dentro del presupuesto ~8s de Alexa.
`executeOneCommand` → NATS → `publishCommand` retorna rápido (publica QoS1, **no** espera
ack del dispositivo). Se responde `Alexa.Response` reflejando el valor **comandado** en
`context.properties` con `uncertaintyInMilliseconds` no-cero. Copiar `correlationToken`,
`endpointId` y `scope`. Errores: validación→`INVALID_VALUE`/`VALUE_OUT_OF_RANGE`;
`RATE_LIMITED`→`RATE_LIMIT_EXCEEDED`; offline→`ENDPOINT_UNREACHABLE`.

### ReportState
Carga device (scoped), lee `SensorDataLast.data` + `Device.online`, usa el **mismo mapper**
para saber qué properties reporta, emite `Alexa.StateReport` (powerState, brightness 0–100,
colorTemperatureInKelvin=`round(1e6/mireds)`, lockState, temperature, detectionState,
connectivity). Los endpoints IR son `retrievable:false` → no se reportan.

---

## Fase C — UI de gestión + runbook de Amazon

- **Card** [AlexaIntegrationCard.tsx](web/src/components/settings/AlexaIntegrationCard.tsx),
  espejo de [McpEndpointCard.tsx](web/src/components/settings/McpEndpointCard.tsx) (revelado
  único del secret) + [XiaozhiIntegrationCard.tsx](web/src/components/settings/XiaozhiIntegrationCard.tsx)
  (estado + toggle/revoke). Backend `apps/api/src/alexa/alexa-integration.controller.ts`
  (`@Controller('users/me/integrations/alexa')`, `AuthenticatedGuard`): `GET /`
  (`{linked, last_linked_at, clientConfigured}`), `POST /client` (provisiona
  `AlexaOAuthClient`, devuelve `client_secret` una vez), `DELETE /link` (revoca tokens).
  Muestra las URLs `/authorize` + `/token` copiables y un `<details>` con el runbook.
  Añadir claves i18n `settings.alexa.*`.
- **Runbook Amazon** (docs, no código; en `alexa-lambda/README.md` y el `<details>`):
  crear skill Smart Home → crear Lambda (Node 20/22, `us-east-1`/`eu-west-1`, pegar
  `index.mjs`, env `PUBLIC_APP_URL`, trigger Alexa Smart Home, copiar ARN al endpoint) →
  Account Linking (Auth Code Grant; Authorization URI = `…/alexa/oauth/authorize`;
  Access Token URI = `…/alexa/oauth/token`; client_id/secret de `POST /client`; añadir las
  redirect URLs de Alexa —layla/pitangui/…— a `redirect_uris`) → Test tab "Discover devices".

---

## Transversal

- **Migración:** `prisma/migrations/<ts>_alexa_oauth/migration.sql` escrita a mano
  (copiar el estilo de `20260507204426_mcp_tokens/migration.sql`), luego
  `npx prisma migrate deploy && npx prisma generate`. **Nunca `migrate dev`/reset**
  (TimescaleDB — ver memoria de drift de migraciones).
- **Audit opcional:** añadir `'alexa'` al enum `source` de `command_executions`
  (toca `send-device-command.tool.ts`, `device-command.service.ts`, el tipo del payload
  en `mqtt-core.controller.ts`) para distinguir el tráfico de Alexa. Bajo riesgo.
- **Seam v2 (proactivo) — diseñar para no bloquearlo:** mantener el mapper y la proyección
  `SensorDataLast → properties Alexa` **puras/standalone** para que un futuro
  `AlexaChangeReporter` las reutilice. v2 añade un `@EventPattern('mqtt-core.sensor.data')`
  + `'mqtt-core.device.availability'` (igual que [sse.controller.ts](apps/api/src/sse/sse.controller.ts))
  que hace POST del `ChangeReport` al Event Gateway. **Añadir ya** un handler
  `Alexa.Authorization/AcceptGrant` que persista el grant, de modo que Discovery anuncie
  `proactivelyReported:false` en v1 y se voltee a `true` en v2 sin cambio de esquema.
- **Orden y tamaño:** (A) esquema + endpoints OAuth *curl-testables* — **M** · (registro
  skill+Lambda para obtener client_id/redirect reales — **S**) · (B) mapper + Discovery +
  ReportState + control + Lambda — **L**, el mapper es el grueso · (C) card + i18n + runbook
  — **S** · (opcional) AcceptGrant stub + audit `alexa` — **S**. Camino crítico: A → registro → B → C.

---

## Verificación end-to-end (sin Echo físico)

1. **OAuth aislado:** insertar un `AlexaOAuthClient` (o usar `POST /client`); abrir
   `/authorize` en el navegador logueado → confirmar redirect a `redirect_uri?code=…`;
   `curl -u client_id:secret -d 'grant_type=authorization_code&code=…&redirect_uri=…' …/alexa/oauth/token`
   → esperar `{access_token, refresh_token, expires_in}`; repetir con `grant_type=refresh_token`.
2. **Directivas aislado (loop más rápido):** con ese `access_token`,
   `curl -H "Authorization: Bearer <t>" -d @discover.json …/api/v1/alexa/directives`
   → assert `Discover.Response` con los dispositivos y sus capabilities; luego un
   `PowerController/TurnOn` (endpointId `dev:<uuid>`) → assert `Alexa.Response` **y** una
   fila nueva en `command_executions` + publish MQTT (tail de logs de mqtt-core). Guardar
   `discover.json`/`turn_on.json` como fixtures (sirven de tests).
3. **Lambda:** consola AWS → Test con el mismo JSON → confirmar que proxya y devuelve la
   respuesta de la API.
4. **Linking real:** app Alexa → vincular cuenta (ejercita `/authorize` en el webview +
   `/token`), "Discover devices" y un comando de voz; confirmar por `command_executions`.
5. **Tests unitarios** (jest, como `parse-exposes.spec.ts`): `capability-mapper` (cada fila),
   `directive-to-command` (escala de brillo, HSB→hex, Kelvin passthrough, enum de modos) y
   OAuth (single-use/expiry/redirect-allowlist del code).

---

## Archivos críticos

- [mcp-token.service.ts](apps/api/src/mcp/mcp-token.service.ts) +
  [mcp-auth.middleware.ts](apps/api/src/mcp/mcp-auth.middleware.ts) — forma verbatim del
  token store OAuth + middleware bearer.
- [send-device-command.tool.ts](libs/ai-tools/src/tools/send-device-command.tool.ts)
  (`executeOneCommand`) + [learned-ir-commands.tool.ts](libs/ai-tools/src/tools/learned-ir-commands.tool.ts)
  — path de control + escenas IR a reutilizar.
- [types.ts](libs/models/src/device/protocols/types.ts) +
  [normalize-command.ts](libs/models/src/device/protocols/zigbee/normalize-command.ts) +
  [device-capabilities.ts](web/src/lib/device-capabilities.ts) — modelo de capacidades,
  conversiones color/Kelvin, e inferencia de displayCategory.
- [schema.prisma](prisma/schema.prisma) (+ migración manual) — los 4 modelos OAuth.
- [xiaozhi.controller.ts](apps/api/src/integrations/xiaozhi/xiaozhi-integration.controller.ts)
  + [app.module.ts](apps/api/src/app.module.ts) — patrón CRUD de integración y registro del módulo.
