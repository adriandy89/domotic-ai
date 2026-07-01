# edge-rules-engine (standalone)

Autonomous, offline rules engine that runs in the customer's home (Orange Pi). It
evaluates `run_offline` rules, runs `run_offline` schedules and a local care watchdog
against the **local mosquitto broker** + **SQLite**, so automations keep working with no
internet. Notifications are never sent offline — they're delegated to central on reconnect.

## Why it's a separate project

This is the only piece of Domotic-AI logic that ships to the customer's device, so it is
deliberately **decoupled from the platform** (`apps/`, `libs/`): its own `package.json`,
`tsconfig`, `Dockerfile`, and no `@app/db|nats|cache` — only MQTT + SQLite.

To avoid drifting from the central engine, the **pure** logic (rule evaluation + the
protocol→MQTT command adapters) is **vendored**, not reimplemented:

```
src/vendor/rules-evaluator  ← libs/rules-evaluator/src        (source of truth)
src/vendor/protocols        ← libs/models/src/device/protocols (source of truth)
```

- `pnpm vendor` regenerates `src/vendor` from the monorepo (runs automatically on `prebuild`).
- `pnpm vendor:check` fails if `src/vendor` drifted — enforced in CI
  (`.github/workflows/edge-vendor-drift.yml`). Edit the originals in `libs/`, then re-vendor.

The committed `src/vendor` makes the Docker image buildable from this directory alone
(no monorepo needed at deploy time).

## Architecture

```
zigbee2mqtt ─▶ mosquitto (local) ─▶ IngestService ─▶ SQLite (device_state)
                     ▲                     │
                     │                     ▼
             CommandService ◀──────── EngineService (event-driven, run_offline COMMANDs)
                     ▲            WatchdogService (cron: STALE/INACTIVE)
                     │            SchedulesService (self-rescheduling cron)
                     │
   SyncService ◀── retained `home/id/{uuid}/edge/rules` (HMAC-verified) + HTTP pull fallback
   UploadService ─▶ POST /api/v1/edge/executions (buffered, idempotent) when online
```

## Run

```bash
pnpm install
pnpm build && pnpm start        # or: pnpm dev
```

Env vars (see `../.env.example`): `HOME_UNIQUE_ID`, `MQTT_URL`, `MQTT_USERNAME`,
`MQTT_PASSWORD`, `RULES_SYNC_TOPIC`, `CENTRAL_API_URL`, `EDGE_AUTH_TOKEN`, `SQLITE_PATH`,
`WATCHDOG_INTERVAL_SECONDS`. Normally started via `../docker-compose.yml`.

## Test

```bash
pnpm test
```
