import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EDGE_CONFIG, EdgeConfig } from '../config';
import { MqttService } from '../mqtt/mqtt.service';
import { SqliteService } from '../store/sqlite.service';
import { EngineService } from '../engine/engine.service';
import { PowerMonitorService } from '../power-monitor/power-monitor.service';

/**
 * Subscribes to local device telemetry on the mosquitto broker, persists the
 * latest state (+ transitions) to SQLite, and drives the event-driven engine.
 * Ignores command echoes, bridge metadata, availability and the rules topic.
 */
@Injectable()
export class IngestService implements OnModuleInit {
  private readonly logger = new Logger(IngestService.name);
  private readonly base: string;

  constructor(
    @Inject(EDGE_CONFIG) private readonly config: EdgeConfig,
    private readonly mqtt: MqttService,
    private readonly sqlite: SqliteService,
    private readonly engine: EngineService,
    private readonly powerMonitor: PowerMonitorService,
  ) {
    this.base = `home/id/${this.config.homeUniqueId}`;
  }

  onModuleInit(): void {
    this.mqtt.onMessage((topic, payload) => this.handle(topic, payload));
    // All protocols/devices under this home (state), e.g. .../zigbee/{device}.
    this.mqtt.subscribe(`${this.base}/+/#`);
  }

  private handle(topic: string, payload: Buffer): void {
    if (!topic.startsWith(`${this.base}/`)) return;
    const rest = topic.slice(this.base.length + 1); // "{protocol}/{device...}"
    const slash = rest.indexOf('/');
    if (slash < 0) return;
    const protocol = rest.slice(0, slash);
    let devicePath = rest.slice(slash + 1);

    // Ignore non-state topics.
    if (protocol === 'edge') return; // rules bundle — handled by sync
    if (
      devicePath === 'bridge' ||
      devicePath.startsWith('bridge/') || // zigbee2mqtt bridge metadata
      // Command echoes: depth-2 `.../set` (Zigbee) AND depth-3 per-property
      // `.../set/{prop}` (lan-bridge/HA), which we publish ourselves.
      devicePath.endsWith('/set') ||
      devicePath.includes('/set/') ||
      devicePath.endsWith('/get') ||
      devicePath.includes('/get/') ||
      devicePath.endsWith('/availability')
    ) {
      return;
    }

    // HA-Discovery / lan-bridge devices publish their aggregate state on
    // `.../{protocol}/{id}/state` (depth-3). Strip the `/state` suffix so the
    // device key matches the bundle's unique_id (`{id}`, no suffix). Zigbee state
    // is depth-2 (`.../zigbee/{id}`, no `/state`) and is left untouched.
    if (devicePath.endsWith('/state')) {
      devicePath = devicePath.slice(0, -'/state'.length);
    }

    const deviceUniqueId = devicePath;
    let data: Record<string, any>;
    try {
      data = JSON.parse(payload.toString());
    } catch {
      return; // not JSON telemetry
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;

    // Record transitions (changed attributes) before overwriting latest state.
    const prev = this.sqlite.getDeviceState(deviceUniqueId)?.data ?? {};
    const now = Date.now();
    for (const [key, value] of Object.entries(data)) {
      if (prev[key] !== value) {
        this.sqlite.recordStateEvent(deviceUniqueId, key, value, now);
      }
    }

    this.sqlite.upsertDeviceState(deviceUniqueId, data);
    this.engine.onTelemetry(deviceUniqueId, data, prev);
    this.powerMonitor.onTelemetry(deviceUniqueId, data);
  }
}
