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
});
