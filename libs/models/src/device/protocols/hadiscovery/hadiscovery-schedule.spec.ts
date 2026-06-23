import { HaDiscoveryAdapter } from './hadiscovery.adapter';
import { HaDeviceAttributes } from './ha-config.types';
import { DeviceProtocol } from '../types';

const HOME = 'fe40902d-6b76-49e2-9b18-611f4599737e';
const SET_TOPIC = `home/id/${HOME}/wifi/relay-89de3530/set`;

/**
 * Real device-based config for the ESP32 relay: a writable `switch` (relay) plus the
 * on-board `schedule` exposed as a read-only `text` component on the shared state topic.
 */
const relayConfig = {
  '~': `home/id/${HOME}/wifi/relay-89de3530`,
  dev: {
    ids: ['relay-89de3530'],
    name: 'relay-89de3530',
    mf: 'domotic-ai',
    mdl: 'domoticai-esp-relay',
  },
  stat_t: '~/state',
  cmps: {
    relay: {
      p: 'switch',
      cmd_t: '~/set',
      value_template: '{{value_json.relay}}',
      unique_id: 'relay-89de3530_relay',
    },
    schedule: {
      p: 'text',
      value_template: '{{value_json.schedule}}',
      unique_id: 'relay-89de3530_schedule',
    },
  },
};

const attributes: HaDeviceAttributes = {
  source: 'hadiscovery',
  protocol: 'wifi',
  config: relayConfig,
};

const deviceRef = {
  homeUniqueId: HOME,
  deviceUniqueId: 'relay-89de3530',
  protocol: DeviceProtocol.WIFI,
  attributes,
};

const sampleSchedule = [
  { id: 1, days: 127, time: '05:00', action: 'ON', enabled: true },
  { id: 2, days: 127, time: '05:05', action: 'OFF', enabled: true },
];

describe('HaDiscoveryAdapter — on-device schedule', () => {
  const adapter = new HaDiscoveryAdapter();

  it('exposes `schedule` as a writable action', () => {
    const actions = adapter.getAvailableActions(attributes);
    const schedule = actions.find((a) => a.property === 'schedule');
    expect(schedule).toBeDefined();
    expect(schedule?.type).toBe('schedule');
    // The relay stays a binary action alongside it.
    expect(actions.find((a) => a.property === 'relay')?.type).toBe('binary');
  });

  it('validates a well-formed schedule command', () => {
    const actions = adapter.getAvailableActions(attributes);
    expect(adapter.validateCommand({ schedule: sampleSchedule }, actions)).toEqual(
      { valid: true },
    );
  });

  it('rejects more than 8 entries and bad times', () => {
    const actions = adapter.getAvailableActions(attributes);

    const tooMany = Array.from({ length: 9 }, (_, i) => ({
      days: 127,
      time: '05:00',
      action: 'ON',
      enabled: true,
      id: i + 1,
    }));
    const res1 = adapter.validateCommand({ schedule: tooMany }, actions);
    expect(res1.valid).toBe(false);
    if (!res1.valid) expect(res1.errors[0].code).toBe('INVALID_SCHEDULE');

    const badTime = [{ days: 127, time: '25:00', action: 'ON', enabled: true }];
    const res2 = adapter.validateCommand({ schedule: badTime }, actions);
    expect(res2.valid).toBe(false);
    if (!res2.valid) expect(res2.errors[0].code).toBe('INVALID_SCHEDULE');
  });

  it('builds the wrapped {"schedule":[...]} payload on the shared /set topic', () => {
    const messages = adapter.buildCommandMessages(deviceRef, {
      schedule: sampleSchedule,
    });
    expect(messages).toEqual([
      { topic: SET_TOPIC, payload: JSON.stringify({ schedule: sampleSchedule }) },
    ]);
  });

  it('still sends the relay command as a raw value (no regression)', () => {
    const messages = adapter.buildCommandMessages(deviceRef, { relay: 'ON' });
    expect(messages).toEqual([{ topic: SET_TOPIC, payload: 'ON' }]);
  });
});
