import { CommandService } from './command.service';
import { EdgeConfig } from '../config';
import type { MqttService } from '../mqtt/mqtt.service';
import type { EdgeDeviceMeta } from '../vendor/rules-evaluator';

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

/** A lan-bridge Android TV as snapshotted into the edge bundle (protocol wifi). */
function tvDevice(
  attributesOverride?: Record<string, unknown>,
): EdgeDeviceMeta {
  return {
    id: 'tv1',
    uniqueId: 'tv1',
    protocol: 'wifi',
    attributes: attributesOverride ?? {
      source: 'hadiscovery',
      protocol: 'wifi',
      config: {
        dev: { ids: ['tv1'], name: 'TV de Dormitorio' },
        o: { name: 'lan-bridge' },
        '~': 'home/id/home-1/wifi/tv1',
        avty_t: '~/availability',
        cmps: {
          power: {
            p: 'switch',
            name: 'Power',
            uniq_id: 'tv1_power',
            stat_t: '~/state',
            val_tpl: '{{value_json.power}}',
            cmd_t: '~/set/power',
            pl_on: 'ON',
            pl_off: 'OFF',
          },
          volume: {
            p: 'number',
            name: 'Volume',
            uniq_id: 'tv1_volume',
            stat_t: '~/state',
            val_tpl: '{{value_json.volume}}',
            cmd_t: '~/set/volume',
            min: 0,
            max: 100,
            step: 1,
          },
        },
      },
    },
  };
}

function makeCommand() {
  const published: { topic: string; payload: string }[] = [];
  const mqtt = {
    publish: (topic: string, payload: string) =>
      published.push({ topic, payload }),
  } as unknown as MqttService;
  return { command: new CommandService(config, mqtt), published };
}

describe('CommandService — lan-bridge TV (hadiscovery/wifi)', () => {
  it('maps { power: "ON" } to the per-property set topic with the right payload', () => {
    const { command, published } = makeCommand();
    const ok = command.send(tvDevice(), { power: 'ON' });
    expect(ok).toBe(true);
    expect(published).toEqual([
      { topic: 'home/id/home-1/wifi/tv1/set/power', payload: 'ON' },
    ]);
  });

  it('normalizes on/off (case-insensitive) to the discovery payloads', () => {
    const { command, published } = makeCommand();
    command.send(tvDevice(), { power: 'off' });
    expect(published[0]).toEqual({
      topic: 'home/id/home-1/wifi/tv1/set/power',
      payload: 'OFF',
    });
  });

  it('routes a numeric volume to its own command topic', () => {
    const { command, published } = makeCommand();
    command.send(tvDevice(), { volume: 20 });
    expect(published).toEqual([
      { topic: 'home/id/home-1/wifi/tv1/set/volume', payload: '20' },
    ]);
  });

  it('returns false and publishes nothing when the bundle has STALE/empty TV attributes (D2)', () => {
    const { command, published } = makeCommand();
    // Device row existed before its discovery config landed → no command topics.
    const stale = tvDevice({ source: 'hadiscovery', protocol: 'wifi', config: { cmps: {} } });
    const ok = command.send(stale, { power: 'ON' });
    expect(ok).toBe(false);
    expect(published).toHaveLength(0);
  });

  it('returns false for an empty command', () => {
    const { command, published } = makeCommand();
    expect(command.send(tvDevice(), {})).toBe(false);
    expect(published).toHaveLength(0);
  });

  it('skips an unknown protocol instead of throwing', () => {
    const { command, published } = makeCommand();
    const ok = command.send(
      { id: 'x', uniqueId: 'x', protocol: 'nonsense', attributes: {} },
      { power: 'ON' },
    );
    expect(ok).toBe(false);
    expect(published).toHaveLength(0);
  });

  it('rejects a value outside the number range (validation)', () => {
    const { command, published } = makeCommand();
    const ok = command.send(tvDevice(), { volume: 999 });
    expect(ok).toBe(false);
    expect(published).toHaveLength(0);
  });
});
