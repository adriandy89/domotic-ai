# Edge Stack (offline-first) — opt-in

The **edge stack** makes a home keep working when it loses internet. It runs a local
MQTT broker (**mosquitto**) plus an autonomous **edge-rules-engine**, so rules marked
`run_offline`, schedules and the care watchdog keep firing without the central backend.

> ⚠️ **This is the only non-upstream component of `stack-client`.** The rest of
> `stack-client/` is just docker-compose + config over official upstream images (see
> [../README.md](../README.md)). The `edge-rules-engine` is Domotic-AI code, kept as a
> **self-contained project** under [`./rules-engine`](./rules-engine) so it never mixes
> with the central platform (`apps/`, `libs/`). It reuses the platform's pure evaluation
> logic via a vendored copy (see that project's README).

Deploy this **only** on homes with `edge_enabled = true`.

## How it changes the data flow

```
Before (central-only):
  zigbee2mqtt ──(internet)──▶ TBMQ ──▶ mqtt-core ──▶ rules-engine (central)

After (edge):
  zigbee2mqtt ──▶ mosquitto (LOCAL) ──▶ edge-rules-engine (local rules)
                       │
                       └──bridge store-and-forward──▶ TBMQ (central, when online)
```

`mosquitto` uses the **same topics** zigbee2mqtt used directly against TBMQ
(`home/id/{unique_id}/...`), so the central `mqtt-core` needs no changes — only *who*
talks to TBMQ from the home changes (the bridge instead of zigbee2mqtt directly).

## Setup

1. **Credentials + config.** Copy `.env.example` → `.env` and fill the per-home values
   from the dashboard (Integrations → Edge).

2. **Local broker password.** Create the mosquitto password file for the engine's local
   client:
   ```bash
   docker run --rm -it -v "$PWD/mosquitto:/m" eclipse-mosquitto:2-openssl \
     mosquitto_passwd -c /m/passwords "$EDGE_MQTT_USER"
   ```

3. **Bridge credentials.** In `mosquitto/mosquitto.conf`, replace `HOME_UNIQUE_ID`,
   `HOME_MQTT_PASSWORD` and `your-tbmq-server.com` with the home's values (the same
   `unique_id`/password zigbee2mqtt already used against TBMQ).

4. **Repoint zigbee2mqtt to the local broker.** In
   `../zigbee/zigbee2mqtt-data/configuration.yaml` change:
   ```yaml
   mqtt:
     server: mqtt://mosquitto:1883   # was: mqtt://your-tbmq-server.com:1883
   ```
   Keep the same `user`/`password`/`client_id`/`base_topic`. Put zigbee2mqtt on the
   `edge` docker network (or run both stacks so they share it). This is **reversible**:
   point `server` back at TBMQ to disable the edge path.

5. **Start it.**
   ```bash
   docker compose up -d
   ```

## What works offline

| Feature | Offline |
| --- | --- |
| Rules `run_offline` with a **COMMAND** result | ✅ local |
| Schedules `run_offline` | ✅ local cron |
| Watchdog (care/absence) | ✅ local — no false positives from the outage |
| Manual control from the dashboard | ❌ needs the backend |
| Notifications (Telegram/email) | ❌ delegated to central on reconnect |
| AI assistant | ❌ needs the backend |
| Historical telemetry | ⏳ buffered, delivered on reconnect |

## Notes

- **TBMQ persistent session** must be enabled for client id `{unique_id}-bridge`, or the
  store-and-forward queue is lost on reconnect.
- **Clock:** local schedules depend on the device clock — run NTP/chrony on the host.
