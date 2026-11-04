import { WatchdogService } from './watchdog.service';
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

/**
 * AND rule with two STALE absence conditions: cond on device A is
 * trigger-enabled (default), cond on device B is evaluator-only
 * (trigger: false). Fires a COMMAND to device B.
 */
function bundle(): EdgeBundle {
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
        id: 'w1',
        name: 'Both silent → plug on',
        type: RuleType.RECURRENT,
        active: true,
        all: true,
        interval: 0,
        window_active: false,
        window_days: [],
        window_all_day: true,
        window_start: null,
        window_end: null,
        created_at: new Date(Date.now() - 3_600_000).toISOString(),
        conditions: [
          {
            id: 'c1',
            device_id: 'A',
            attribute: 'temperature',
            operation: Operation.STALE,
            data: { forSeconds: 60 },
          },
          {
            id: 'c2',
            device_id: 'B',
            attribute: 'contact',
            operation: Operation.STALE,
            data: { forSeconds: 60 },
            trigger: false,
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
  };
}

function makeWatchdog() {
  const sqlite = new SqliteService(config);
  sqlite.onModuleInit();
  const store = new RulesStoreService(sqlite);
  store.setBundle(bundle());
  const published: { topic: string; payload: string }[] = [];
  const mqtt = { publish: (topic: string, payload: string) => published.push({ topic, payload }) } as unknown as MqttService;
  const command = new CommandService(config, mqtt);
  const watchdog = new WatchdogService(config, store, sqlite, command);
  return { watchdog, sqlite, store, published };
}

describe('WatchdogService — AND-mode trigger gating for absence rules', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  /**
   * Make BOTH conditions met (last report > 60s ago) with only `freshDevice`
   * reporting AFTER the last alert (so only its absence episode is fresh).
   */
  function seed(sqlite: SqliteService, freshDevice: 'sensor-a' | 'plug-b') {
    const now = Date.now();
    const staleDevice = freshDevice === 'sensor-a' ? 'plug-b' : 'sensor-a';
    jest.setSystemTime(now - 300_000); // before the last alert → not fresh
    sqlite.upsertDeviceState(staleDevice, {});
    jest.setSystemTime(now - 120_000); // after the last alert, still stale (>60s)
    sqlite.upsertDeviceState(freshDevice, {});
    jest.setSystemTime(now);
    sqlite.kvSet('watchdog:lastalert:w1', String(now - 200_000));
  }

  it('does not fire when only the trigger:false condition is fresh', () => {
    const { watchdog, sqlite, published } = makeWatchdog();
    seed(sqlite, 'plug-b'); // fresh episode only on the evaluator-only condition

    watchdog.scan();

    expect(published).toHaveLength(0);
    expect(sqlite.pendingExecutions()).toHaveLength(0);
  });

  it('fires when the trigger-enabled condition is fresh (trigger:false still counts toward met)', () => {
    const { watchdog, sqlite, published } = makeWatchdog();
    seed(sqlite, 'sensor-a'); // fresh episode on the trigger-enabled condition

    watchdog.scan();

    expect(published).toHaveLength(1);
    expect(published[0].topic).toBe('home/id/home-1/zigbee/plug-b/set');
    expect(JSON.parse(published[0].payload)).toEqual({ state: 'ON' });
    expect(sqlite.pendingExecutions()).toHaveLength(1);
  });
});
