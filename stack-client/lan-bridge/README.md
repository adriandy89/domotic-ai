# LAN Bridge

Standalone sidecar (Orange Pi, next to `stack-client/zigbee`, `zwave`, …) that
speaks the proprietary local protocols of LAN appliances — Smart TVs today —
and exposes them to the platform through the **existing** HA MQTT Discovery
contract. Nothing in the monorepo changes: devices appear as protocol `wifi`
(plug&play, enabled on creation) via `apps/mqtt-core`'s `HaIngestionService`.

## How it maps to MQTT

For each device in `DEVICES` (base topic `~` = `home/id/{HOME_UNIQUE_ID}/wifi/{id}`):

| Topic | Direction | Payload |
|---|---|---|
| `home/id/{home}/discovery/device/{id}/config` | bridge → platform (retained) | HA-Discovery bundle (`dev`, `~`, `avty_t`, `cmps`) |
| `~/state` | bridge → platform (retained) | aggregate JSON, e.g. `{"power":"ON","volume":15,"mute":"OFF","input":"HDMI 1","app":"Netflix"}` |
| `~/availability` | bridge → platform (retained) | `online` / `offline` |
| `~/set/{property}` | platform → bridge | raw value (`ON`, `15`, `HDMI 1`) — published by the hadiscovery adapter's `buildCommandMessages` |

TV components: `power` (switch), `volume` (number 0–100), `mute` (switch), and
— once the driver has read them from the TV — `input` and `app` (selects with
real options; the retained config is republished when they become known).

## Pairing from the dashboard (recommended)

The bridge registers **itself** as a device ("LAN Bridge" card, protocol
`wifi`) with a `pairing` switch — the same UX as zigbee2mqtt's `permit_join`:

1. Turn ON **Pairing mode** on the LAN Bridge card (or via the AI:
   `send-device-command {"pairing":"ON"}`).
2. The bridge scans the LAN (SSDP) for 60s and connects to every unmanaged TV
   it finds → the TV shows its own **accept prompt**.
3. Accept on the TV. That's the authorization: the device is persisted
   (`DATA_DIR/devices.json`), its name comes from the TV itself, the MAC for
   Wake-on-LAN is auto-detected (ARP), and the card appears in the dashboard
   immediately.
4. The window closes after 60s (or turn the switch OFF); the `Last discovery`
   sensor summarizes what was found/paired.

Nothing is ever added without the on-TV confirmation. A background scan also
logs unpaired TVs every 10 min (`DISCOVERY_ENABLED`).

## Drivers

- **webos** (LG TVs): persistent websocket on port 3000 via `lgtv2`. The
  pairing client key is persisted in `DATA_DIR`. Power-on uses Wake-on-LAN
  (`mac`, auto-detected when pairing — enable "LG Connect Apps" /
  "Mobile TV On" on the TV). Pairing = accept the prompt on the TV.
- **androidtv** (Android/Google TV): Remote v2 protocol (TLS 6466/6467) via
  `androidtv-remote`, discovered over mDNS (`_androidtvremote2._tcp`). Pairing =
  the TV shows a 6-char code; type it in the **Pairing code** field of the
  LAN Bridge card. The trusted client certificate is persisted in `DATA_DIR`.
  Controls: power, volume 0-100 (paced key steps — the protocol has no absolute
  set), mute; the foreground app is exposed read-only. Power works from standby
  (the remote service stays up), no Wake-on-LAN needed.

Planned: `tizen` (Samsung), `broadlink` (IR).

## Configuration (env)

| Var | Default | Notes |
|---|---|---|
| `HOME_UNIQUE_ID` | — (required) | Same home id the rest of the stack uses |
| `MQTT_URL` | `mqtt://mosquitto:1883` | Local broker (bridged to TBMQ) |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | — | Broker credentials |
| `DEVICES` | `[]` | Optional seed: JSON array of devices (pairing from the dashboard is the normal path) |
| `DEVICES_FILE` | — | Path to a JSON file with the same array |
| `DATA_DIR` | `/data` | Pairing keys (persist this volume) |
| `DISCOVERY_ENABLED` | `true` | SSDP scan that logs unconfigured TVs |

Device entry example:

```json
[
  {
    "type": "webos",
    "id": "tv_salon",
    "name": "TV Salón",
    "ip": "192.168.1.50",
    "mac": "AA:BB:CC:DD:EE:FF"
  }
]
```

## Run

```bash
pnpm install
HOME_UNIQUE_ID=<uuid> MQTT_URL=mqtt://localhost:1883 DATA_DIR=./data \
  DEVICES='[{"type":"webos","id":"tv_salon","name":"TV Salón","ip":"192.168.1.50","mac":"AA:BB:CC:DD:EE:FF"}]' \
  pnpm dev
```

Docker (needs the LAN — use host networking so SSDP/WoL broadcasts work):

```bash
docker build -t lan-bridge .
docker run --network host -v lan-bridge-data:/data \
  -e HOME_UNIQUE_ID=... -e MQTT_URL=mqtt://127.0.0.1:1883 -e DEVICES='[...]' lan-bridge
```

## Test

```bash
pnpm test
```

NestJS 12 ships as ESM only; this CommonJS project loads it through `require(esm)`.
The runtime needs Node >= 22.12, but Jest can only do that on **Node >= 24.9**
with `--experimental-vm-modules` (already passed by `pnpm test`). On Node 22 the
suites fail with "Must use import to load ES Module".

## Verify end-to-end

1. `mosquitto_sub -t 'home/id/<home>/discovery/#' -v` → retained config appears.
2. The device shows up in the dashboard (protocol `wifi`, enabled).
3. Send a command (dashboard / MCP `send-device-command`, e.g. `{"volume": 10}`)
   → the bridge receives `~/set/volume` → the TV reacts → `~/state` updates.
