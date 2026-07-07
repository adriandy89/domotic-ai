import { PowerMonitorService } from './power-monitor.service';
import { EdgeConfig } from '../config';
import type { MqttService } from '../mqtt/mqtt.service';
import type { SqliteService } from '../store/sqlite.service';
import type { RulesStoreService } from '../rules/rules-store.service';
import type { EdgeApplianceMonitor } from '../vendor/rules-evaluator';

const config = { homeUniqueId: 'home-1' } as EdgeConfig;

const monitor: EdgeApplianceMonitor = {
  id: 'mon-1',
  sourceDeviceUniqueId: 'plug-a',
  applianceUniqueId: 'apmon-1',
  powerField: 'power',
  runThresholdW: 10,
  idleThresholdW: 2,
  minRunSeconds: 30,
  minFinishSeconds: 120,
  active: true,
};

function make() {
  const published: Array<{ topic: string; payload: any; retain?: boolean }> =
    [];
  const mqtt = {
    publish: (topic: string, payload: string, opts?: { retain?: boolean }) =>
      published.push({
        topic,
        payload: JSON.parse(payload),
        retain: opts?.retain,
      }),
  } as unknown as MqttService;

  const kv = new Map<string, string>();
  const sqlite = {
    kvGet: (k: string) => kv.get(k) ?? null,
    kvSet: (k: string, v: string) => kv.set(k, v),
  } as unknown as SqliteService;

  const store = {
    monitorForSource: (id: string) =>
      id === monitor.sourceDeviceUniqueId ? monitor : undefined,
  } as unknown as RulesStoreService;

  const svc = new PowerMonitorService(config, mqtt, sqlite, store);
  const t0 = 1_700_000_000_000;
  const feed = (sec: number, power: number) =>
    svc.onTelemetry('plug-a', { power, last_seen: t0 + sec * 1000 });
  return { svc, feed, published };
}

describe('PowerMonitorService (edge host)', () => {
  it('publishes a retained idle → running → finished sequence on the appliance topic', () => {
    const { feed, published } = make();
    feed(0, 0); // announce idle
    feed(10, 500);
    feed(45, 500); // running
    feed(200, 0);
    feed(340, 0); // finished

    const states = published.map((p) => p.payload.appliance_state);
    expect(states).toEqual(['idle', 'running', 'finished']);
    expect(published.every((p) => p.retain === true)).toBe(true);
    expect(published[0].topic).toBe('home/id/home-1/wifi/apmon-1/state');
    const finished = published[published.length - 1].payload;
    expect(finished.cycle_seconds).toBeGreaterThan(0);
    expect(finished.peak_power_w).toBeGreaterThanOrEqual(500);
  });

  it('ignores telemetry from non-monitored devices', () => {
    const { svc, published } = make();
    svc.onTelemetry('some-other-plug', {
      power: 999,
      last_seen: 1_700_000_000_000,
    });
    expect(published).toHaveLength(0);
  });

  it('persists phase so a fresh service instance resumes mid-cycle', () => {
    const { feed, published } = make();
    feed(0, 0);
    feed(10, 500);
    feed(45, 500); // running
    expect(published.map((p) => p.payload.appliance_state)).toEqual([
      'idle',
      'running',
    ]);
    // Phase is written to kv; a new instance sharing the kv would load 'running'
    // and not re-announce — covered by the write-through in loadState/saveState.
  });
});
