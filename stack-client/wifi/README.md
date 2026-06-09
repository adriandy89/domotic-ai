# WiFi edge integration (native MQTT firmware)

WiFi devices speak MQTT **natively from their firmware** — there is no bridge container to
run. The backend consumes **Home Assistant MQTT discovery**, in either shape:

- **Device-based discovery** (what the `domotic-ai` firmware emits, HA 2024.11+): a single
  retained config per device that bundles every entity under `cmps`. Recommended.
- **Per-entity discovery** (classic, e.g. ESPHome): one retained config per entity. Also
  supported.

> Note: Tasmota deprecated `SetOption19` (HA discovery) and moved to its own
> `tasmota/discovery/` format with a non-configurable prefix, so it isn't a first-class fit
> for the per-home discovery prefix today. It can be added later with a dedicated handler.

## Device-based discovery (recommended — `domotic-ai` firmware)

Get the broker host and the per-home credentials from the dashboard → **Integraciones →
WiFi** (username = the home `unique_id`; the same credential works for every protocol).
Use a **unique `client_id` per device** (e.g. `{homeUniqueId}-wifi-{deviceId}`).

**Topics the firmware publishes** (`{deviceId}` = stable per-device id):

| Topic | Retained | Payload | Purpose |
|-------|----------|---------|---------|
| `home/id/{homeUniqueId}/discovery/device/{deviceId}/config` | ✅ | device-based bundle (`cmps`) | Discovery: registers the device + metadata |
| `home/id/{homeUniqueId}/wifi/{deviceId}/state` | optional | one JSON object | State: all fields in a single message |
| `home/id/{homeUniqueId}/wifi/{deviceId}/availability` | ✅ | `{"state":"online"}` / `"offline"` | Online/offline status |

For controllable entities (switch/light/…), add a `command_topic` (`cmd_t`) in the component,
e.g. `~/set`; the backend publishes commands there.

The discovery config uses the `~` base topic and a `cmps` (components) map. Each component
declares its `p` (platform), `device_class`, `unit_of_measurement`, `value_template` and
`unique_id`. Example (sound sensor):

```jsonc
// topic: home/id/{homeUniqueId}/discovery/device/sensor-62f11110/config
{
  "~": "home/id/{homeUniqueId}/wifi/sensor-62f11110",
  "dev": { "ids": ["sensor-62f11110"], "name": "sensor-62f11110",
           "mf": "domotic-ai", "mdl": "domoticai-esp-sound" },
  "availability": [{ "topic": "~/availability", "value_template": "{{value_json.state}}" }],
  "payload_available": "online", "payload_not_available": "offline",
  "stat_t": "~/state",
  "cmps": {
    "noise_db": { "p": "sensor", "device_class": "sound_pressure",
                  "unit_of_measurement": "dB", "value_template": "{{value_json.noise_db}}",
                  "unique_id": "sensor-62f11110_noise_db" }
    // … more components
  }
}
```

Key points the backend relies on:

- All components **share one JSON state topic** (`~/state` = `home/id/{homeUniqueId}/wifi/
  {deviceId}/state`); each `value_template` selects its field (`{{value_json.<field>}}`).
  The backend ingests the whole JSON and maps every field — the device-based config simply
  **enriches** that data with names/units/device_class.
- **Availability** on `~/availability` (e.g. `{"state":"online"}`) drives the device's
  online/offline status (`Device.online`), pushed live to the dashboard over SSE.
- The **complete config is stored verbatim** in `Device.attributes`
  (`{ source, protocol, config }`, like Zigbee stores its bridge object); capabilities are
  derived from it at read time. Nothing (`sw`/`hw`/`o`/`value_template`/…) is dropped.

On boot the device publishes the retained config; the backend registers it (WiFi = enabled
plug&play) with full metadata. Switches/lights become controllable; sensors are read-only.

> The MQTT broker ACL for the home (`home/id/{homeUniqueId}/.*`) already covers both the
> `wifi` and `discovery` namespaces — no credential changes needed.

## Per-entity discovery (classic, e.g. ESPHome)

Add the `mqtt` block to your ESPHome YAML, replacing `{homeUniqueId}`, the broker and the
per-home credentials (from the dashboard → Integrations → WiFi):

```yaml
mqtt:
  broker: <your-mqtt-host>
  port: 1883
  username: 1234-fake-id-long-string          # the home username
  password: FakePassw0rd                       # the home password
  client_id: 1234-fake-id-long-string-wifi-livingplug  # unique per device
  # State/command namespace for this protocol:
  topic_prefix: home/id/1234-fake-id-long-string/wifi/livingplug
  discovery: true
  # Per-home HA discovery prefix (keeps homes isolated + within the broker ACL):
  discovery_prefix: home/id/1234-fake-id-long-string/discovery
```

Flash the device. On boot it publishes one retained config per entity under
`home/id/{homeUniqueId}/discovery/<component>/.../config`; the backend registers it with full
metadata. Switches/lights become controllable; sensors are read-only.

## Without HA discovery (aggregate state) — discovery is optional

Custom firmware that can't emit HA discovery can still be onboarded automatically. Publish
the whole device state as **one JSON object** on the canonical aggregate-state topic:

```
home/id/{homeUniqueId}/wifi/{deviceId}/state
```

```jsonc
// e.g. topic: home/id/1234-fake-id-long-string/wifi/gas-b2a7e255/state
{ "device": "gas-b2a7e255", "ts": 1780998847, "co_ppm": 9.6, "ch4_ppm": 32.3 }
```

On the first such message the backend **auto-registers** the device (protocol `wifi`,
enabled, `unique_id = {deviceId}`) and exposes every scalar key as a read-only sensor
(`device`/`ts`/`timestamp` are treated as metadata, not sensors). Booleans and `on`/`off`
strings become binary sensors.

**Reconciliation contract:** if the device *also* sends HA discovery later, use the **same
`{deviceId}`** as the discovery `device.identifiers` / object id. The discovery config then
*enriches* the existing device (real names, units, command topics) instead of creating a
duplicate. So: send only `/state` to be seen immediately, add discovery whenever you want
control and richer metadata — both paths converge on one device.
