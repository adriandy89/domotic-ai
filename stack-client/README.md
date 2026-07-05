# Stack Client - Edge Setup Guide

This repository contains the **edge stack** that runs in the customer's home. Each
protocol runs an **official upstream image** (never forked) that publishes to the home's
MQTT broker; the Domotic-AI backend ingests everything over MQTT — via **Home Assistant
discovery** (Z-Wave, WiFi, BLE, LAN Bridge) or via the **native zigbee2mqtt bridge**
(Zigbee). The only Domotic-AI code that runs here are two self-contained sidecars:
the **Edge rules engine** ([edge/](edge/), keeps `run_offline` rules working without
internet) and the **LAN Bridge** ([lan-bridge/](lan-bridge/), Smart TVs and other LAN
appliances). Everything else is just `docker compose` + per-home config.

## 🧩 How it works (read this first)

A home has **one MQTT credential** (username = the home `unique_id`). Every protocol
shares that single credential and differs only in three values, all derived from the home
`unique_id`:

| Value | Pattern | Example |
|-------|---------|---------|
| **Topic namespace** | `home/id/{homeUniqueId}/{protocol}` | `home/id/1234-…/zigbee` |
| **Discovery prefix** *(not Zigbee)* | `home/id/{homeUniqueId}/discovery` | `home/id/1234-…/discovery` |
| **Client ID** | `{homeUniqueId}-{protocol}` | `1234-…-zigbee` |

> The `client_id` **must be unique per protocol** (and per device for WiFi) — the username
> is shared across all bridges, but two MQTT clients cannot share a client id.

**Where the values come from:** open the Domotic-AI dashboard → home detail →
**Integrations** (Integraciones), pick the protocol tab, and copy the ready-to-paste
snippet. It already fills in the broker host/port, the username (`unique_id`), the
password, the topics and the client id for that home.

**Auto-registration & enable defaults:** once a bridge publishes, the backend
auto-registers the devices. WiFi is **plug & play (enabled immediately)**; Zigbee, Z-Wave
and BLE devices are **registered disabled** — enable them from the dashboard.

## 📦 Components

| Component | Required | Image / source | Container | Hardware | Docker network |
|-----------|:--------:|----------------|:---------:|----------|----------------|
| **Zigbee** (zigbee2mqtt) | ✅ | `koenkk/zigbee2mqtt` | ✅ | Zigbee USB dongle | creates `zigbee` |
| **Z-Wave** (zwave-js-ui) | ⬜ | `zwavejs/zwave-js-ui` | ✅ | Z-Wave USB stick | creates `zwave` |
| **WiFi** (native firmware) | ⬜ | `domotic-ai` firmware | ⬜ (no container) | — | device's own WiFi |
| **BLE** (Theengs Gateway) | ⬜ | `theengs/gateway` | ✅ | Bluetooth adapter | host network |
| **Edge (offline)** (mosquitto + rules engine) | ⬜ | `eclipse-mosquitto` + [edge/rules-engine](edge/rules-engine/) | ✅ | — | creates `edge`, mosquitto publishes `:1883` |
| **LAN Bridge** (Smart TVs, LAN appliances) | ⬜ | [lan-bridge/](lan-bridge/) | ✅ | — | host network (SSDP/mDNS/WoL) |
| **Portainer** | ⬜ | `portainer/portainer-ce` | ✅ | — | joins `zigbee` |
| **Cloudflare Tunnel** | ⬜ | `cloudflare/cloudflared` | ✅ | — | joins `zigbee` |

Each protocol is **independent** — install only the ones you need. Each subfolder has its
own `docker-compose.yml` (and, for Z-Wave / WiFi / BLE, its own `README.md`).

## 📋 Prerequisites

Before starting, ensure you have:
- Docker Engine + Docker Compose installed
- The per-home MQTT values from the dashboard (**Integrations** panel)
- The relevant hardware for each protocol you enable:
  - Zigbee → a Zigbee USB dongle (e.g. Sonoff Zigbee 3.0 USB Dongle Plus)
  - Z-Wave → a Z-Wave USB controller stick
  - BLE → a Bluetooth adapter on the host
  - WiFi → none (devices speak MQTT from their own firmware)

---

## 1️⃣ Zigbee Setup (zigbee2mqtt)

Zigbee2MQTT bridges your Zigbee devices to MQTT. Unlike the other protocols it does **not**
use HA discovery — the backend reads the native zigbee2mqtt `bridge/devices` list and the
device `exposes`.

### Step 1: Identify your Zigbee dongle

```bash
ls -l /dev/serial/by-id/
```

You should see something like:
```
usb-ITead_Sonoff_Zigbee_3.0_USB_Dongle_Plus_XXXXXXXX-if00-port0
```

### Step 2: Map the dongle in docker-compose

Edit [zigbee/docker-compose.yml](zigbee/docker-compose.yml) and set the `devices:` path to
your actual dongle:

```yaml
devices:
  - /dev/serial/by-id/usb-ITead_Sonoff_Zigbee_3.0_USB_Dongle_Plus_XXXXXXXX-if00-port0:/dev/ttyUSB0
```

### Step 3: Configure MQTT

Edit [zigbee/zigbee2mqtt-data/configuration.yaml](zigbee/zigbee2mqtt-data/configuration.yaml).
Copy the values from the dashboard → **Integrations → Zigbee**:

```yaml
mqtt:
  # Per-protocol namespace: home/id/{homeUniqueId}/zigbee
  base_topic: home/id/{homeUniqueId}/zigbee
  server: mqtt://your-mqtt-server.com:1883
  version: 5
  # Distinct client_id per protocol (the home username is shared across bridges):
  client_id: {homeUniqueId}-zigbee
  user: {homeUniqueId}
  password: your-password
```

Other settings to review:

```yaml
frontend:
  enabled: true
  port: 8080
  auth_token: your-secure-token-here   # change the default
advanced:
  pan_id: GENERATE          # or a number between 1 and 0xFFFE
  ext_pan_id: GENERATE      # or an 8-byte array
  network_key: GENERATE     # keep GENERATE for a secure auto key
  channel: 20               # try 15, 20 or 25 (avoid 11 with heavy WiFi)
  last_seen: epoch
homeassistant:
  enabled: false            # Zigbee uses the native bridge, NOT HA discovery
```

> ⚠️ Leave `homeassistant.enabled: false`. The backend consumes the native zigbee2mqtt
> bridge object — turning HA discovery on would publish a second, conflicting shape.

### Step 4: Start and verify

```bash
cd zigbee
docker compose up -d
docker compose logs -f
```

Open the web UI at `http://localhost:8080` and enter the `auth_token` from step 3. New
devices appear in the dashboard **disabled** — enable the ones you want.

---

## 2️⃣ Z-Wave Setup (zwave-js-ui) — optional

Official image [`zwavejs/zwave-js-ui`](https://zwave-js.github.io/zwave-js-ui/): a Z-Wave
control panel with a built-in MQTT gateway. It publishes standard HA discovery messages
that the backend consumes — nothing custom.

```bash
cd zwave
# 1. Plug the Z-Wave stick and set the devices: by-id path in docker-compose.yml
docker compose up -d
# 2. Open http://<host>:8091 and configure MQTT + HA discovery in the UI
```

The MQTT name (gateway prefix) is `home/id/{homeUniqueId}/zwave`, the client id
`{homeUniqueId}-zwave`, and the HA discovery prefix `home/id/{homeUniqueId}/discovery`.

👉 **Full instructions:** [zwave/README.md](zwave/README.md)

---

## 3️⃣ WiFi Setup (native MQTT firmware) — optional

WiFi devices speak MQTT **directly from their firmware** — there is **no container to run**.
The backend consumes HA discovery (the `domotic-ai` firmware emits device-based `cmps`
bundles), and devices come online **plug & play (enabled)**. Devices that can't emit
discovery can still be onboarded by publishing a single aggregate JSON state.

Use a **unique `client_id` per device** (e.g. `{homeUniqueId}-wifi-{deviceId}`). Copy the
broker + topics from the dashboard → **Integrations → WiFi**.

👉 **Full instructions (discovery shapes, topics, examples):** [wifi/README.md](wifi/README.md)

---

## 4️⃣ BLE Setup (Theengs Gateway) — optional

Official image [`theengs/gateway`](https://gateway.theengs.io/): bridges read-only
Bluetooth LE sensors (temperature, humidity, battery, …) to MQTT with HA discovery.

```bash
cd ble
# Edit docker-compose.yml: set MQTT host/credentials and replace {homeUniqueId} in the topics
docker compose up -d
```

Needs **host networking + DBus** for the Bluetooth adapter (already set in the compose
file). Publishes under `home/id/{homeUniqueId}/ble/BTtoMQTT` with discovery prefix
`home/id/{homeUniqueId}/discovery`. Devices register **disabled** — enable them in the
dashboard.

👉 **Full instructions:** [ble/README.md](ble/README.md)

---

## 5️⃣ Edge (offline rules) Setup — optional

The **edge stack** keeps `run_offline` rules, schedules and the care watchdog working
when the home loses internet. It runs a **local mosquitto broker** (store-and-forward
bridge to central TBMQ, published on host port `1883`) plus the **edge rules engine**
(standalone NestJS + SQLite — the shared pure evaluator is vendored, so offline behavior
is identical to central). Enable it per home with the `edge_enabled` toggle.

```bash
cd edge
# Copy the ready-to-paste .env + mosquitto bridge lines from the dashboard →
# Integrations → Edge (offline), then:
docker compose up -d
```

Delayed (interval) rules are cancelled the moment their conditions stop being met and
restart from zero on the next match — same semantics as the central engine.

👉 **Full instructions:** [edge/README.md](edge/README.md) and
[edge/rules-engine/README.md](edge/rules-engine/README.md)

---

## 6️⃣ LAN Bridge (Smart TVs & LAN appliances) Setup — optional

The **LAN bridge** integrates devices that speak proprietary LAN protocols — LG webOS
TVs (websocket + Wake-on-LAN) and Android/Google TVs (Remote v2) today — and exposes
them through the standard **HA MQTT Discovery** contract, so they show up as `wifi`
devices (plug & play) with no backend changes.

It registers **itself** as a device too: the **LAN Bridge card** in the dashboard has a
`Pairing mode` switch (zigbee2mqtt `permit_join`-style). Turn it ON, and:
- **LG webOS**: accept the prompt the TV shows → paired.
- **Android TV**: the TV shows a 6-char code → type it in the card's **Pairing code**
  field → paired.

Paired devices persist in the `lan-bridge-data` volume; MAC for Wake-on-LAN is
auto-detected. **Host networking is required** (SSDP/mDNS multicast + WoL broadcast),
so it reaches the local broker via `mqtt://127.0.0.1:1883` — the port the edge stack
publishes. The mosquitto bridge must include the per-property command downlink line
(`topic home/id/{homeUniqueId}/+/+/set/+ in 1` — included in the dashboard snippet).

```bash
cd lan-bridge
cp .env.example .env   # set HOME_UNIQUE_ID + MQTT credentials
docker compose up -d
```

👉 **Full instructions:** [lan-bridge/README.md](lan-bridge/README.md)

---

## 7️⃣ Portainer Setup (optional)

Portainer provides a web UI for managing Docker containers.

```bash
cd portainer
docker compose up -d
```

Open `http://localhost:9000` and create an admin account on first access. From there you
can view containers, logs and resource usage.

> Portainer attaches to the **external `zigbee` network**, so start the Zigbee stack first
> (it creates that network).

---

## 8️⃣ Cloudflare Tunnel Setup (optional)

Cloudflare Tunnel exposes your services remotely without opening router ports.

### Step 1: Create a tunnel

1. Log in to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. **Networks → Tunnels → Create a tunnel**
3. Choose **Cloudflared**, name it, and copy the tunnel token (`eyJhIjoiXXXXXX...`)

### Step 2: Set the token

Edit [cloudflare/compose.yml](cloudflare/compose.yml) and replace the placeholder token:

```yaml
command: tunnel --no-autoupdate run --token YOUR_ACTUAL_TOKEN_HERE
```

### Step 3: Configure routes & start

In the Cloudflare dashboard add public hostnames, e.g.:
- `zigbee.yourdomain.com` → `http://zigbee2mqtt:8080`
- `portainer.yourdomain.com` → `http://portainer:9000`

```bash
docker compose up -d
docker compose logs -f   # expect "Registered tunnel connection"
```

> Like Portainer, cloudflared joins the **external `zigbee` network**, so start the Zigbee
> stack first.

---

## 🔧 Network Architecture

Protocols are **independent**; only the optional management services share a network with
Zigbee:

```
   Zigbee stack ──────────────┐ creates the "zigbee" network
   (zigbee2mqtt :8080)        │
                              ├──────────────┐
                       ┌──────▼─────┐   ┌─────▼────────┐
                       │ Portainer  │   │ Cloudflared  │   (join "zigbee", external: true)
                       │  :9000     │   │  (tunnel)    │
                       └────────────┘   └──────────────┘

   Z-Wave stack ─── creates its own "zwave" network (zwave-js-ui :8091, ws :3000)
   BLE stack    ─── host networking (Theengs Gateway + DBus)
   WiFi         ─── no container; devices use their own WiFi

   Edge stack ──── creates the "edge" network:
                   mosquitto (local broker, host port :1883, bridged ⇄ TBMQ)
                   edge-rules-engine (offline rules, SQLite)

   LAN Bridge ──── host networking (SSDP/mDNS discovery + Wake-on-LAN need the
                   real LAN) → talks to mosquitto via 127.0.0.1:1883
```

**Start order:** if you use Portainer or Cloudflare Tunnel, start the **Zigbee** stack
first — it creates the `zigbee` network they attach to (`external: true`). The **LAN
Bridge** needs the **Edge** stack's mosquitto (host port `1883`) up first. Z-Wave, BLE
and WiFi have no ordering dependency.

---

## 📝 Maintenance & Troubleshooting

Run these inside the relevant subfolder (`zigbee/`, `zwave/`, `ble/`, `edge/`,
`lan-bridge/`, `portainer/`, `cloudflare/`):

```bash
docker compose logs -f       # view logs
docker compose restart       # restart
docker compose down          # stop
docker compose pull && docker compose up -d   # update images
```

### Common issues

**USB dongle not detected (Zigbee / Z-Wave)**
- Re-check the path: `ls -l /dev/serial/by-id/`
- Grant serial access: `sudo usermod -aG dialout $USER` (re-login required)

**Device shows up but stays disabled**
- Expected for Zigbee / Z-Wave / BLE — enable it in the dashboard. Only WiFi is enabled on
  arrival.

**Nothing appears in the dashboard**
- Verify the `base_topic` / discovery prefix use the **home `unique_id`** exactly.
- Verify the `client_id` is unique per protocol — a duplicate id silently disconnects the
  other client.
- Check broker connectivity in the bridge logs (auth failures show there).

**Portainer / Cloudflare can't find the network**
- Start the Zigbee stack first: `docker network ls | grep zigbee`

**LAN Bridge card toggles do nothing (uplink OK, no logs on the bridge)**
- The mosquitto bridge section must include the per-property command downlink:
  `topic home/id/{homeUniqueId}/+/+/set/+ in 1`. Add it and restart mosquitto.
- With host networking, `MQTT_URL` must be `mqtt://127.0.0.1:1883` — Docker-network
  hostnames like `mosquitto` do not resolve in host mode.

**Cloudflare tunnel not connecting**
- Verify the token and that the tunnel name matches the dashboard.

---

## 🛡️ Security Recommendations

1. **Change default tokens** — zigbee2mqtt `frontend.auth_token`, Portainer admin, etc.
2. **Keep credentials per home** — never reuse one home's MQTT credential for another.
3. **Generate a secure Zigbee network key** (`network_key: GENERATE`).
4. **Cloudflare Access** — add Access policies in front of exposed services.
5. **Keep images updated** — `docker compose pull` regularly.

---

## 📚 Additional Resources

- [Zigbee2MQTT](https://www.zigbee2mqtt.io/)
- [Z-Wave JS UI](https://zwave-js.github.io/zwave-js-ui/)
- [Theengs Gateway](https://gateway.theengs.io/)
- [Portainer](https://docs.portainer.io/)
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)

---

## 📄 License

This stack configuration is provided as-is for personal use.
