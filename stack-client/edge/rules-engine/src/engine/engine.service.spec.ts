import { EngineService } from './engine.service';
import { RulesStoreService } from '../rules/rules-store.service';
import { SqliteService } from '../store/sqlite.service';
import { CommandService } from '../command/command.service';
import { MqttService } from '../mqtt/mqtt.service';
import { EdgeConfig } from '../config';
import {
  EdgeBundle,
  Operation,
  ResultType,
  RuleType,
} from '../vendor/rules-evaluator';

const config: EdgeConfig = {
  homeUniqueId: 'home-1',
  mqttUrl: 'mqtt://localhost:1883',
  mqttClientId: 'test',
  rulesSyncTopic: 'home/id/home-1/edge/rules',
  edgeAuthToken: 'secret',
  sqlitePath: ':memory:',
  watchdogIntervalSeconds: 300,
  timezone: 'UTC',
};

function bundle(overrides: Partial<EdgeBundle> = {}): EdgeBundle {
  return {
    homeUniqueId: 'home-1',
    organizationId: 'org-1',
    timezone: 'UTC',
    version: 1,
    devices: [
      { id: 'A', uniqueId: 'sensor-a', protocol: 'zigbee', attributes: {} },
      { id: 'B', uniqueId: 'plug-b', protocol: 'zigbee', attributes: {} },
    ],
    rules: [
      {
        id: 'r1',
        name: 'Hot → plug on',
        type: RuleType.RECURRENT,
        active: true,
        all: true,
        interval: 0,
        window_active: false,
        window_days: [],
        window_all_day: true,
        window_start: null,
        window_end: null,
        created_at: new Date().toISOString(),
        conditions: [
          {
            id: 'c1',
            device_id: 'A',
            attribute: 'temperature',
            operation: Operation.GT,
            data: { value: 30 },
          },
        ],
        results: [
          {
            id: 'res1',
            device_id: 'B',
            event: 'on',
            attribute: 'state',
            data: { value: 'ON' },
            type: ResultType.COMMAND,
            channel: [],
            resend_after: null,
          },
        ],
      },
    ],
    schedules: [],
    ...overrides,
  };
}

function makeEngine() {
  const sqlite = new SqliteService(config);
  sqlite.onModuleInit();
  const store = new RulesStoreService(sqlite);
  store.setBundle(bundle());
  const published: { topic: string; payload: string }[] = [];
  const mqtt = { publish: (topic: string, payload: string) => published.push({ topic, payload }) } as unknown as MqttService;
  const command = new CommandService(config, mqtt);
  const engine = new EngineService(store, sqlite, command);
  return { engine, sqlite, store, published };
}

describe('EngineService (event-driven, offline)', () => {
  it('fires a COMMAND to the target device when the condition matches', () => {
    const { engine, published, sqlite } = makeEngine();

    engine.onTelemetry('sensor-a', { temperature: 35 });

    expect(published).toHaveLength(1);
    expect(published[0].topic).toBe('home/id/home-1/zigbee/plug-b/set');
    expect(JSON.parse(published[0].payload)).toEqual({ state: 'ON' });
    // Execution buffered for later upload.
    expect(sqlite.pendingExecutions()).toHaveLength(1);
  });

  it('does not fire when the condition is not met', () => {
    const { engine, published } = makeEngine();
    engine.onTelemetry('sensor-a', { temperature: 20 });
    expect(published).toHaveLength(0);
  });

  it('ignores telemetry from devices no offline rule references', () => {
    const { engine, published } = makeEngine();
    engine.onTelemetry('unknown-device', { temperature: 99 });
    expect(published).toHaveLength(0);
  });

  it('a ONCE rule fires only once even if the condition keeps matching', () => {
    const { engine, store, published } = makeEngine();
    const b = bundle();
    b.rules[0].type = RuleType.ONCE;
    store.setBundle(b);

    engine.onTelemetry('sensor-a', { temperature: 35 });
    engine.onTelemetry('sensor-a', { temperature: 36 });
    engine.onTelemetry('sensor-a', { temperature: 37 });

    expect(published).toHaveLength(1);
  });

  describe('delayed (interval) rules — sustained conditions', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    /** Rule with `interval: 60` (fire only after 60s of sustained match). */
    function makeDelayedEngine() {
      const parts = makeEngine();
      const b = bundle();
      b.rules[0].interval = 60;
      parts.store.setBundle(b);
      return parts;
    }

    it('fires only after the delay when conditions stay met', () => {
      const { engine, published } = makeDelayedEngine();

      engine.onTelemetry('sensor-a', { temperature: 35 });
      expect(published).toHaveLength(0); // not immediate

      jest.advanceTimersByTime(59_000);
      expect(published).toHaveLength(0);

      jest.advanceTimersByTime(1_000);
      expect(published).toHaveLength(1);
      expect(JSON.parse(published[0].payload)).toEqual({ state: 'ON' });
    });

    it('cancels the pending fire when conditions break during the delay', () => {
      const { engine, published } = makeDelayedEngine();

      engine.onTelemetry('sensor-a', { temperature: 35 }); // arm (met)
      jest.advanceTimersByTime(10_000);
      engine.onTelemetry('sensor-a', { temperature: 20 }); // break → cancel

      jest.advanceTimersByTime(120_000);
      expect(published).toHaveLength(0);
    });

    it('restarts the countdown from zero when conditions match again', () => {
      const { engine, published } = makeDelayedEngine();

      engine.onTelemetry('sensor-a', { temperature: 35 }); // arm
      jest.advanceTimersByTime(30_000);
      engine.onTelemetry('sensor-a', { temperature: 20 }); // break → cancel
      jest.advanceTimersByTime(5_000);
      engine.onTelemetry('sensor-a', { temperature: 35 }); // re-arm from zero

      jest.advanceTimersByTime(59_000);
      expect(published).toHaveLength(0); // old timer would have fired by now

      jest.advanceTimersByTime(1_000);
      expect(published).toHaveLength(1);
    });

    it('does not stack timers while conditions keep matching', () => {
      const { engine, published } = makeDelayedEngine();

      engine.onTelemetry('sensor-a', { temperature: 35 });
      jest.advanceTimersByTime(20_000);
      engine.onTelemetry('sensor-a', { temperature: 36 });
      jest.advanceTimersByTime(20_000);
      engine.onTelemetry('sensor-a', { temperature: 37 });

      // Original fire time stands: 60s after the FIRST match.
      jest.advanceTimersByTime(20_000);
      expect(published).toHaveLength(1);

      jest.advanceTimersByTime(120_000);
      expect(published).toHaveLength(1); // and only once
    });

    it('clearPending() drops armed timers (bundle replaced)', () => {
      const { engine, published } = makeDelayedEngine();

      engine.onTelemetry('sensor-a', { temperature: 35 }); // arm
      engine.clearPending();

      jest.advanceTimersByTime(120_000);
      expect(published).toHaveLength(0);
    });
  });

  it('AND mode waits for cross-device state stored locally', () => {
    const { engine, sqlite, store, published } = makeEngine();
    const b = bundle();
    b.rules[0].conditions.push({
      id: 'c2',
      device_id: 'B',
      attribute: 'contact',
      operation: Operation.EQ,
      data: { value: 'open' },
    });
    store.setBundle(b);

    // Other device not yet known → rule should not fire.
    engine.onTelemetry('sensor-a', { temperature: 35 });
    expect(published).toHaveLength(0);

    // Record B's state, then A reports again → both conditions hold.
    sqlite.upsertDeviceState('plug-b', { contact: 'open' });
    engine.onTelemetry('sensor-a', { temperature: 35 });
    expect(published).toHaveLength(1);
  });

  describe('ALL-mode trigger gate (evaluator-only conditions)', () => {
    /**
     * AND rule: cond A on device A (temperature > 30, trigger default = true)
     * + cond B on device B (contact = open, trigger: false → evaluator-only).
     */
    function gateBundle(interval = 0): EdgeBundle {
      const b = bundle();
      b.rules[0].interval = interval;
      b.rules[0].conditions.push({
        id: 'c2',
        device_id: 'B',
        attribute: 'contact',
        operation: Operation.EQ,
        data: { value: 'open' },
        trigger: false,
      });
      return b;
    }

    it('telemetry matching only the evaluator-only condition never initiates a fire', () => {
      const { engine, sqlite, store, published } = makeEngine();
      store.setBundle(gateBundle());
      // Conditions overall TRUE: A is hot (stored state), B just reported open.
      sqlite.upsertDeviceState('sensor-a', { temperature: 35 });

      engine.onTelemetry('plug-b', { contact: 'open' }, { contact: 'closed' });
      expect(published).toHaveLength(0); // gated: B's condition is evaluator-only

      // Sanity: the very same state DOES fire when the trigger device reports.
      sqlite.upsertDeviceState('plug-b', { contact: 'open' });
      engine.onTelemetry('sensor-a', { temperature: 35 }, { temperature: 20 });
      expect(published).toHaveLength(1);
    });

    describe('with a delayed rule (interval > 0)', () => {
      beforeEach(() => jest.useFakeTimers());
      afterEach(() => jest.useRealTimers());

      /** interval: 60 and cross-device state so either report can evaluate. */
      function makeDelayedGate() {
        const parts = makeEngine();
        parts.store.setBundle(gateBundle(60));
        parts.sqlite.upsertDeviceState('sensor-a', { temperature: 35 });
        parts.sqlite.upsertDeviceState('plug-b', { contact: 'open' });
        return parts;
      }

      it('evaluator-only telemetry that breaks the conditions cancels the pending timer', () => {
        const { engine, published } = makeDelayedGate();

        engine.onTelemetry('sensor-a', { temperature: 35 }, { temperature: 20 }); // arm
        jest.advanceTimersByTime(10_000);
        // B (evaluator-only) reports "closed" → conditions no longer hold → cancel.
        engine.onTelemetry('plug-b', { contact: 'closed' }, { contact: 'open' });

        jest.advanceTimersByTime(120_000);
        expect(published).toHaveLength(0);
      });

      it('evaluator-only telemetry that keeps the conditions true leaves the timer armed', () => {
        const { engine, published } = makeDelayedGate();

        engine.onTelemetry('sensor-a', { temperature: 35 }, { temperature: 20 }); // arm
        jest.advanceTimersByTime(30_000);
        // B still "open" → conditions still hold → no cancel, no re-arm, no fire.
        engine.onTelemetry('plug-b', { contact: 'open' }, { contact: 'open' });

        jest.advanceTimersByTime(29_000);
        expect(published).toHaveLength(0);
        jest.advanceTimersByTime(1_000);
        expect(published).toHaveLength(1); // 60s after the ORIGINAL arm
      });
    });

    it('rules without the trigger field (old bundles) keep the pre-gate behavior', () => {
      const { engine, sqlite, store, published } = makeEngine();
      const b = bundle();
      b.rules[0].conditions.push({
        id: 'c2',
        device_id: 'B',
        attribute: 'contact',
        operation: Operation.EQ,
        data: { value: 'open' },
        // no `trigger` field at all — pre-feature bundle
      });
      store.setBundle(b);
      sqlite.upsertDeviceState('sensor-a', { temperature: 35 });

      // Any referenced device's matching telemetry may initiate — even without
      // prevData (old call sites) there is no change-gate.
      engine.onTelemetry('plug-b', { contact: 'open' });
      expect(published).toHaveLength(1);
    });

    it('OR rules ignore the flag: a trigger:false condition still fires from its own data', () => {
      const { engine, store, published } = makeEngine();
      const b = gateBundle();
      b.rules[0].all = false;
      store.setBundle(b);

      engine.onTelemetry('plug-b', { contact: 'open' }, { contact: 'open' });
      expect(published).toHaveLength(1);
    });
  });
});
