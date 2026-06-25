# BLE edge stack (Theengs Gateway)

Official image: [`theengs/gateway`](https://gateway.theengs.io/) ([source](https://github.com/theengs/gateway)).
A Bluetooth LE → MQTT gateway for **read-only** sensors (temperature, humidity, battery, …).
Nothing custom — Theengs publishes standard Home Assistant discovery messages and the
backend's HA-Discovery adapter consumes them.

## 1. Configure

Edit [docker-compose.yml](docker-compose.yml) with the **per-home values** from the
Domotic-AI dashboard (**Integrations → BLE**), replacing `{homeUniqueId}` with your home id:

```yaml
environment:
  - MQTT_HOST=<your-mqtt-host>
  - MQTT_PORT=1883
  - MQTT_USERNAME={homeUniqueId}          # the home username
  - MQTT_PASSWORD=<your-password>
  # Per-protocol state namespace and per-home HA discovery prefix:
  - MQTT_PUB_TOPIC=home/id/{homeUniqueId}/ble/BTtoMQTT
  - MQTT_SUB_TOPIC=home/id/{homeUniqueId}/ble/+/commands
  - DISCOVERY=true
  - DISCOVERY_TOPIC=home/id/{homeUniqueId}/discovery
```

Notes:
- **Host networking + DBus** are required for the Bluetooth adapter and are already set in
  the compose file (`network_mode: host`, `privileged: true`, the `/var/run/dbus` mount).
- The MQTT username is the home `unique_id` (shared across protocols). This setup doesn't
  set an explicit `client_id` for BLE — run **one BLE gateway per home** so there's no
  client-id collision on the broker.

## 2. Start it

```bash
docker compose up -d
docker compose logs -f
```

As Theengs detects BLE sensors it publishes retained
`home/id/{homeUniqueId}/discovery/.../config` messages; the backend auto-registers each
device. BLE devices are registered **disabled by default** — enable the ones you want in
the dashboard. Sensors are **read-only** (no commands).

> The MQTT broker ACL for the home (`home/id/{homeUniqueId}/.*`) already covers both the
> `ble` and `discovery` namespaces — no credential changes needed.
