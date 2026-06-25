# Z-Wave edge stack (zwave-js-ui)

Official image: [`zwavejs/zwave-js-ui`](https://github.com/zwave-js/zwave-js-ui). Z-Wave
control panel **with a built-in MQTT gateway**. Nothing custom — the backend's HA-Discovery
adapter consumes the standard Home Assistant discovery messages this image emits.

## 1. Start it

1. Plug your Z-Wave USB controller and update the `devices:` path in
   [docker-compose.yml](docker-compose.yml) to your dongle's `by-id` path.
2. `docker compose up -d`
3. Open the UI at `http://<host>:8091`.

## 2. Configure (UI → Settings)

Copy the **per-home MQTT credentials** from the Domotic-AI dashboard (Integrations → Z-Wave)
and set, replacing `{homeUniqueId}` with your home id:

**Settings → Z-Wave**
- Serial Port: `/dev/zwave`  *(the in-container path the `devices:` mapping exposes — not the host `by-id` path)*

**Settings → MQTT**
- Host: `mqtt://<your-mqtt-host>:1883`
- Username / Password: the home credentials
- Name (gateway prefix): `home/id/{homeUniqueId}/zwave`
- Client ID: `{homeUniqueId}-zwave`  *(must be unique per protocol — the username is shared)*
- Prefix: leave empty (the Name already namespaces topics)

**Settings → Home Assistant**
- Enable **MQTT Discovery**: ON
- Discovery Prefix: `home/id/{homeUniqueId}/discovery`

Save & restart. zwave-js-ui will publish retained `home/id/{homeUniqueId}/discovery/.../config`
messages; the backend auto-registers each device (disabled by default — enable it in the
dashboard). Commands are published by the backend to each entity's `command_topic`.

> The MQTT broker ACL for the home (`home/id/{homeUniqueId}/.*`) already covers both the
> `zwave` and `discovery` namespaces — no credential changes needed.
