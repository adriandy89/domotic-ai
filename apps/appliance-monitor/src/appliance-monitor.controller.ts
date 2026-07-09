import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import type { ISensorData } from '@app/models';
import { ConfigStoreService } from './config-store.service';
import { StateMachineService } from './state-machine.service';

@Controller()
export class ApplianceMonitorController {
  constructor(
    private readonly store: ConfigStoreService,
    private readonly machine: StateMachineService,
  ) {}

  @EventPattern('mqtt-core.sensor.data')
  onSensorData(@Payload() event: ISensorData): void {
    const mon = this.store.monitorForSource(event.deviceId);
    if (!mon) return; // not a monitored source plug — hot-path early return

    const data = event.data as Record<string, unknown>;
    const powerW = toNumber(data?.[mon.powerField]);
    if (powerW === null) return;

    const sampleAtMs = parseSampleTs(data, event.timestamp);
    this.machine.onSample(mon, powerW, sampleAtMs);
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

/** Prefer a payload-embedded sample time; else the event's ingest timestamp. */
function parseSampleTs(
  data: Record<string, unknown>,
  eventTs: Date | string | number,
): number {
  const raw = data?.last_seen ?? data?.ts ?? data?.timestamp;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw > 1e12 ? raw : raw * 1000;
  }
  if (typeof raw === 'string') {
    const t = Date.parse(raw);
    if (!Number.isNaN(t)) return t;
  }
  const et = new Date(eventTs).getTime();
  return Number.isNaN(et) ? Date.now() : et;
}
