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

2. **Local broker passwords.** Create the mosquitto password file with the engine's
   local client, then **add** every client that will publish locally — at minimum
   zigbee2mqtt's user (the home `unique_id`, with the same password it already used
   against TBMQ). Do this **before** `docker compose up`: the compose bind-mounts
   `./mosquitto/passwords`, and if it doesn't exist docker creates a *directory* in its
   place and mosquitto crash-loops with `Error: Unable to open pwfile`.
   ```bash
   # engine user — -c CREATES the file (and overwrites it if it exists!)
   docker run --rm -it -v "$PWD/mosquitto:/m" eclipse-mosquitto:2-openssl \
     mosquitto_passwd -c /m/passwords "$EDGE_MQTT_USER"
   # zigbee2mqtt user — no -c, APPENDS to the file
   docker run --rm -it -v "$PWD/mosquitto:/m" eclipse-mosquitto:2-openssl \
     mosquitto_passwd /m/passwords "$HOME_UNIQUE_ID"

    # Important:
    chmod 644 mosquitto/passwords
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
   Keep the same `user`/`password`/`client_id`/`base_topic`, and make sure that user is
   in the local password file (step 2) — mosquitto has `allow_anonymous false`.

   The container name `mosquitto` only resolves if both containers share a docker
   network, so join zigbee2mqtt to the `edge` network with the override shipped in the
   zigbee stack:
   ```bash
   cd ../zigbee
   cp docker-compose.edge.yml docker-compose.override.yml
   ```
   This is **reversible**: delete `docker-compose.override.yml`, point `server` back at
   TBMQ and recreate to disable the edge path.

5. **Start it** — the edge stack **first** (it creates the `edge` network the override
   declares as external), then recreate zigbee2mqtt:
   ```bash
   docker compose up -d
   cd ../zigbee && docker compose up -d --force-recreate
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

## Updating the engine (redeploy after a code change)

The `edge-rules-engine` image is **built on the home's machine** from source (the
Dockerfile vendors the platform's pure logic and compiles it — no monorepo needed). So a
fix to rules/schedules/lan-bridge support only reaches a home after the image is rebuilt:

```bash
cd stack-client/edge
git pull                                   # get the new source
docker compose build edge-rules-engine     # re-vendor + tsc → new image
docker compose up -d                        # recreate the container
docker logs -f edge-rules-engine            # watch it apply the bundle
```

A **stale image** is a common cause of "my offline rule/schedule does nothing": e.g. an
image predating WiFi/HA (lan-bridge) support logs `Unknown protocol "wifi"; skipping` and
drops the command.

## Diagnosing an offline rule/schedule that didn't fire

Read `docker logs edge-rules-engine` and look, in order:

1. **Bundle synced?** `Applied bundle vN … R rules, S schedules` — the timestamp must be
   *after* you created/edited the rule. If it never appears, the edge is running an old
   bundle: check `CENTRAL_API_URL` / `EDGE_AUTH_TOKEN` in `.env` and that the home is
   `edge_enabled`. The retained bundle does **not** survive the 3.1.1 bridge across a
   restart, so the boot-time HTTP pull is what reconciles — it must be able to reach the
   backend.
2. **Schedule armed?** `Scheduled … {id}`. `skipped: ONCE schedule date is in the past`
   means a one-off whose time had already passed when the bundle arrived.
3. **It fired?** `Schedule {id} fired (N command(s))` / `Rule {id} fired (N command(s))`
   plus a `→ home/id/{home}/wifi/{tv}/set/power ON` line. If `N = 0`, look for:
   - `Unknown protocol "wifi"` → stale image (rebuild, see above).
   - `Command for … rejected` → the value failed validation.
   - `mapped to no messages` → the bundle holds **stale/empty device attributes** (the
     device's discovery config changed after the rule's last edit; the backend now
     republishes the bundle on discovery changes, so re-pull/rebuild fixes it).
   - `unknown target/device` → the bundle predates the target device.
4. **Condition-triggered rule never evaluates?** The engine only reacts to telemetry that
   arrives on the **local** broker for a device in the rule's *conditions*. HA/lan-bridge
   devices report aggregate state on `.../wifi/{id}/state`.

The edge also uploads an audit row per fire (`edge_execution` table); an `executed:false`
row confirms the rule *fired* but produced no command.

## Notes

- **TBMQ persistent session** must be enabled for client id `{unique_id}-bridge`, or the
  store-and-forward queue is lost on reconnect.
- **Do NOT set `bridge_protocol_version mqttv50`.** TBMQ 2.2.0 does not honour a bridge
  SUBSCRIBE that carries the MQTT v5 *no-local* option: with v5 the **downlink silently
  stops** (commands from the dashboard and the retained rules bundle never reach the
  home) while the uplink telemetry keeps working. Stay on mosquitto's 3.1.1 default.
- **Echo/loop is prevented by the directional `topic` map, not by no-local.** The bridge
  subscribes on TBMQ only to `.../+/+/set` and `.../edge/rules` (the DOWN traffic) and
  publishes UP only telemetry (never `/set`). in-set and out-set don't overlap, so a
  command the edge engine runs locally is never shipped up and can't bounce back and
  re-execute. See the comments in `mosquitto/mosquitto.conf`.
- **Passwords file permissions:** `mosquitto_passwd` run via `docker run` leaves the file
  owned by root; the in-container `chown` fails on the `:ro` mount, so make it readable
  (`chmod 644 mosquitto/passwords`) or mosquitto dies with `Unable to open pwfile`.
- **Clock:** local schedules depend on the device clock — run NTP/chrony on the host.


EXAMPLE:

cd stack-client/edge
docker compose down
rmdir mosquitto/passwords        # el directorio fantasma que creó Docker
docker run --rm -it -v "$PWD/mosquitto:/m" eclipse-mosquitto:2-openssl \
  mosquitto_passwd -c /m/passwords edge-rules
docker run --rm -it -v "$PWD/mosquitto:/m" eclipse-mosquitto:2-openssl \
  mosquitto_passwd /m/passwords home_id_here_as_user   # password de TBMQ
# pon la password de edge-rules en EDGE_MQTT_PASS del .env (sigue en placeholder)

chmod 644 mosquitto/passwords
docker compose up -d
