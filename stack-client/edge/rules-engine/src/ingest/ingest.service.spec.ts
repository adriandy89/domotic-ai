import { IngestService } from './ingest.service';
import { EdgeConfig } from '../config';
import type { MqttMessageHandler } from '../mqtt/mqtt.service';
import type { MqttService } from '../mqtt/mqtt.service';
import type { SqliteService } from '../store/sqlite.service';
import type { EngineService } from '../engine/engine.service';

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
 * Wire an IngestService against fakes and return the captured message handler so
 * tests can feed raw (topic, payload) pairs exactly as the broker would.
 */
function makeIngest() {
  let handler: MqttMessageHandler = () => {};
  const subscriptions: string[] = [];
  const mqtt = {
    onMessage: (h: MqttMessageHandler) => (handler = h),
    subscribe: (t: string) => subscriptions.push(t),
  } as unknown as MqttService;

  const state = new Map<string, { data: Record<string, any> }>();
  const events: Array<{ id: string; key: string; value: any }> = [];
  const sqlite = {
    getDeviceState: (id: string) => state.get(id),
    upsertDeviceState: (id: string, data: Record<string, any>) =>
      state.set(id, { data }),
    recordStateEvent: (id: string, key: string, value: any) =>
      events.push({ id, key, value }),
  } as unknown as SqliteService;

  const telemetry: Array<{ id: string; data: Record<string, any> }> = [];
  const engine = {
    onTelemetry: (id: string, data: Record<string, any>) =>
      telemetry.push({ id, data }),
  } as unknown as EngineService;

  const ingest = new IngestService(config, mqtt, sqlite, engine);
  ingest.onModuleInit();

  const feed = (topic: string, payload: unknown) =>
    handler(
      topic,
      Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)),
    );

  return { feed, telemetry, state, events, subscriptions };
}

describe('IngestService — device key derivation & echo filtering', () => {
  it('strips the /state suffix so HA/lan-bridge devices match the bundle unique_id', () => {
    const { feed, telemetry, state } = makeIngest();
    // lan-bridge TV publishes aggregate state at .../wifi/{id}/state (depth-3).
    feed('home/id/home-1/wifi/tv1/state', { power: 'ON', volume: 14 });

    expect(telemetry).toEqual([
      { id: 'tv1', data: { power: 'ON', volume: 14 } },
    ]);
    expect(state.get('tv1')?.data).toEqual({ power: 'ON', volume: 14 });
    // NOT stored under the corrupt "tv1/state" key.
    expect(state.get('tv1/state')).toBeUndefined();
  });

  it('keeps Zigbee depth-2 state topics unchanged (no /state suffix)', () => {
    const { feed, telemetry } = makeIngest();
    feed('home/id/home-1/zigbee/sensor-a', { temperature: 22 });
    expect(telemetry).toEqual([
      { id: 'sensor-a', data: { temperature: 22 } },
    ]);
  });

  it('ignores our own command echoes — depth-2 .../set AND depth-3 .../set/{prop}', () => {
    const { feed, telemetry } = makeIngest();
    feed('home/id/home-1/zigbee/plug-b/set', { state: 'ON' }); // zigbee echo
    feed('home/id/home-1/wifi/tv1/set/power', 'ON'); // lan-bridge per-property echo
    feed('home/id/home-1/wifi/tv1/set/volume', '20');
    expect(telemetry).toHaveLength(0);
  });

  it('ignores /get and /availability topics and the edge rules bundle', () => {
    const { feed, telemetry } = makeIngest();
    feed('home/id/home-1/wifi/tv1/availability', 'online');
    feed('home/id/home-1/zigbee/plug-b/get', { state: '' });
    feed('home/id/home-1/edge/rules', { bundle: {} });
    expect(telemetry).toHaveLength(0);
  });

  it('ignores zigbee2mqtt bridge metadata', () => {
    const { feed, telemetry } = makeIngest();
    feed('home/id/home-1/zigbee/bridge/devices', []);
    feed('home/id/home-1/zigbee/bridge', { state: 'online' });
    expect(telemetry).toHaveLength(0);
  });

  it('drops non-JSON / non-object payloads', () => {
    const { feed, telemetry } = makeIngest();
    feed('home/id/home-1/wifi/tv1/state', 'not-json');
    feed('home/id/home-1/wifi/tv1/state', '42'); // JSON number, not an object
    feed('home/id/home-1/wifi/tv1/state', '[1,2]'); // JSON array
    expect(telemetry).toHaveLength(0);
  });

  it('records transitions for the normalized device key', () => {
    const { feed, events, state } = makeIngest();
    feed('home/id/home-1/wifi/tv1/state', { power: 'OFF' });
    feed('home/id/home-1/wifi/tv1/state', { power: 'ON' });
    // Only the changed attribute is recorded, under the clean key "tv1".
    expect(events).toContainEqual({ id: 'tv1', key: 'power', value: 'ON' });
    expect(state.get('tv1')?.data).toEqual({ power: 'ON' });
  });
});
