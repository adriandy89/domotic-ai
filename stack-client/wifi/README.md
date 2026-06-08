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
`home/id/{homeUniqueId}/discovery/...`; the backend auto-registers it (disabled by default —
enable it in the dashboard). Switches/lights become controllable; sensors are read-only.

> The MQTT broker ACL for the home (`home/id/{homeUniqueId}/.*`) already covers both the
> `wifi` and `discovery` namespaces — no credential changes needed.
