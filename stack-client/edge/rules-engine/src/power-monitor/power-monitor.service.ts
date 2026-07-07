import { Inject, Injectable, Logger } from '@nestjs/common';
import { EDGE_CONFIG, EdgeConfig } from '../config';
import { MqttService } from '../mqtt/mqtt.service';
import { SqliteService } from '../store/sqlite.service';
import { RulesStoreService } from '../rules/rules-store.service';
import {
  AppliancePhaseState,
  EdgeApplianceMonitor,
  initApplianceState,
  stepApplianceState,
} from '../vendor/rules-evaluator';

/**
 * Edge host of the "power-monitoring appliance state" pattern. For each
 * configured source smart plug it runs the pure {@link stepApplianceState}
 * machine over the plug's LOCAL power telemetry (real-time, so the debounce
 * windows are accurate even across a WAN outage) and publishes the derived
 * `appliance_state` as an ordinary HA-aggregate-state message on
 * `home/id/{home}/wifi/{applianceUniqueId}/state`. The mosquitto bridge relays
 * that discrete transition up to central, where mqtt-core ingests it unchanged
 * and a normal rule fires the "finished" notification.
 *
 * Phase is write-through persisted to the SQLite `kv` table so a mid-cycle
 * restart resumes correctly (the machine is timestamp-driven, so the next
 * sample continues the pending timer from where it left off).
 */
@Injectable()
export class PowerMonitorService {
  private readonly logger = new Logger(PowerMonitorService.name);
  private readonly base: string;
  /** monitorId → in-memory phase cache (write-through to SQLite kv). */
  private readonly cache = new Map<string, AppliancePhaseState>();

  constructor(
    @Inject(EDGE_CONFIG) private readonly config: EdgeConfig,
    private readonly mqtt: MqttService,
    private readonly sqlite: SqliteService,
    private readonly store: RulesStoreService,
  ) {
    this.base = `home/id/${this.config.homeUniqueId}`;
  }

  /** Called by IngestService for every parsed device telemetry payload. */
  onTelemetry(deviceUniqueId: string, data: Record<string, any>): void {
    const mon = this.store.monitorForSource(deviceUniqueId);
    if (!mon) return; // not a monitored source plug — hot-path early return

    const powerW = toNumber(data[mon.powerField]);
    if (powerW === null) return;
    const sampleAtMs = parseSampleTs(data);

    const existing = this.loadState(mon.id);
    const firstSample = existing === null;
    const prev = existing ?? initApplianceState(sampleAtMs);

    const { state, transition } = stepApplianceState(
      prev,
      { powerW, sampleAtMs },
      {
        runThresholdW: mon.runThresholdW,
        idleThresholdW: mon.idleThresholdW,
        minRunSeconds: mon.minRunSeconds,
        minFinishSeconds: mon.minFinishSeconds,
      },
    );
    this.saveState(mon.id, state);

    if (transition) {
      this.publishState(mon, transition.phase, powerW, {
        cycle_energy_wh: transition.cycleEnergyWh,
        cycle_seconds: transition.cycleSeconds,
        peak_power_w: transition.peakPowerW,
      });
      this.logger.log(
        `${mon.applianceUniqueId}: → ${transition.phase}` +
          (transition.cycleSeconds
            ? ` (cycle ${transition.cycleSeconds}s, ${transition.cycleEnergyWh}Wh)`
            : ''),
      );
    } else if (firstSample) {
      // Announce the derived device so it appears immediately (before any cycle).
      this.publishState(mon, state.phase, powerW);
    }
  }

  private publishState(
    mon: EdgeApplianceMonitor,
    phase: string,
    powerW: number,
    extra: Record<string, number | undefined> = {},
  ): void {
    const payload: Record<string, unknown> = {
      appliance_state: phase,
      power: Math.round(powerW * 100) / 100,
    };
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined) payload[k] = v;
    }
    this.mqtt.publish(
      `${this.base}/wifi/${mon.applianceUniqueId}/state`,
      JSON.stringify(payload),
      { retain: true },
    );
  }

  private loadState(monitorId: string): AppliancePhaseState | null {
    const cached = this.cache.get(monitorId);
    if (cached) return cached;
    const raw = this.sqlite.kvGet(this.kvKey(monitorId));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as AppliancePhaseState;
      this.cache.set(monitorId, parsed);
      return parsed;
    } catch {
      return null;
    }
  }

  private saveState(monitorId: string, state: AppliancePhaseState): void {
    this.cache.set(monitorId, state);
    this.sqlite.kvSet(this.kvKey(monitorId), JSON.stringify(state));
  }

  private kvKey(monitorId: string): string {
    return `appliance-phase:${monitorId}`;
  }
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Prefer a payload-embedded sample time (zigbee2mqtt last_seen); else now. */
function parseSampleTs(data: Record<string, any>): number {
  const raw = data.last_seen ?? data.ts ?? data.timestamp;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw > 1e12 ? raw : raw * 1000; // ms vs seconds epoch
  }
  if (typeof raw === 'string') {
    const t = Date.parse(raw);
    if (!Number.isNaN(t)) return t;
  }
  return Date.now();
}
