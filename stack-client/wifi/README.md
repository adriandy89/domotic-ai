# WiFi edge integration (ESPHome / native MQTT firmware)

WiFi devices speak MQTT **natively from their firmware** — there is no bridge container to
run. The recommended firmware is **[ESPHome](https://esphome.io/)** because it emits the
standard Home Assistant MQTT discovery the backend consumes, with a configurable prefix.

> Note: Tasmota deprecated `SetOption19` (HA discovery) and moved to its own
> `tasmota/discovery/` format with a non-configurable prefix, so it isn't a first-class fit
> for the per-home discovery prefix today. Prefer ESPHome; Tasmota can be added later with a
> dedicated native handler if needed.

## ESPHome device config (per device)

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

Flash the device. On boot it publishes retained discovery configs under
`home/id/{homeUniqueId}/discovery/...`; the backend registers it with full metadata.
Switches/lights become controllable; sensors are read-only.

> The MQTT broker ACL for the home (`home/id/{homeUniqueId}/.*`) already covers both the
> `wifi` and `discovery` namespaces — no credential changes needed.

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
