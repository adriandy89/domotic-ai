import { DeviceProtocol } from '../types';
import { HaDiscoveryAdapter } from './hadiscovery.adapter';

/**
 * Contract test for the stack-client/lan-bridge sidecar: the discovery bundle
 * it publishes for a Smart TV (see lan-bridge's build-tv-config.ts) must keep
 * resolving to protocol `wifi` with power/volume/mute/input/app capabilities,
 * and commands must target the per-property `…/set/{property}` topics the
 * bridge subscribes to. If this spec fails, the bridge and the platform have
 * drifted apart.
 */
const HOME = 'home-uuid-1';
const BASE = `home/id/${HOME}/wifi/tv_salon`;

const tvConfig = {
  dev: { ids: ['tv_salon'], name: 'TV Salón' },
  o: { name: 'lan-bridge' },
  '~': BASE,
  avty_t: '~/availability',
  cmps: {
    power: {
      p: 'switch',
      name: 'Power',
      uniq_id: 'tv_salon_power',
      stat_t: '~/state',
      val_tpl: '{{value_json.power}}',
      cmd_t: '~/set/power',
      pl_on: 'ON',
      pl_off: 'OFF',
    },
    volume: {
      p: 'number',
      name: 'Volume',
      uniq_id: 'tv_salon_volume',
      stat_t: '~/state',
      val_tpl: '{{value_json.volume}}',
      cmd_t: '~/set/volume',
      min: 0,
      max: 100,
      step: 1,
    },
    mute: {
      p: 'switch',
      name: 'Mute',
      uniq_id: 'tv_salon_mute',
      stat_t: '~/state',
      val_tpl: '{{value_json.mute}}',
      cmd_t: '~/set/mute',
      pl_on: 'ON',
      pl_off: 'OFF',
    },
    input: {
      p: 'select',
      name: 'Input',
      uniq_id: 'tv_salon_input',
      stat_t: '~/state',
      val_tpl: '{{value_json.input}}',
      cmd_t: '~/set/input',
      ops: ['HDMI 1', 'HDMI 2'],
    },
    app: {
      p: 'select',
      name: 'App',
      uniq_id: 'tv_salon_app',
      stat_t: '~/state',
      val_tpl: '{{value_json.app}}',
      cmd_t: '~/set/app',
      ops: ['Netflix', 'YouTube'],
    },
  },
};

describe('lan-bridge TV config through the HA-Discovery adapter', () => {
  const adapter = new HaDiscoveryAdapter();
  const discovered = adapter.parseDiscovery({
    topicParts: ['device', 'tv_salon', 'config'],
    payload: tvConfig,
  })!;

  it('registers as a plug&play wifi device', () => {
    expect(discovered).not.toBeNull();
    expect(discovered.protocol).toBe(DeviceProtocol.WIFI);
    expect(discovered.uniqueId).toBe('tv_salon');
    expect(discovered.name).toBe('TV Salón');
  });

  it('derives the TV actions with their constraints', () => {
    const actions = adapter.getAvailableActions(discovered.attributes);
    const byProp = Object.fromEntries(actions.map((a) => [a.property, a]));

    expect(byProp.power).toMatchObject({
      type: 'binary',
      valueOn: 'ON',
      valueOff: 'OFF',
    });
    expect(byProp.volume).toMatchObject({
      type: 'numeric',
      valueMin: 0,
      valueMax: 100,
      valueStep: 1,
    });
    expect(byProp.mute).toMatchObject({ type: 'binary' });
    expect(byProp.input).toMatchObject({
      type: 'enum',
      values: ['HDMI 1', 'HDMI 2'],
    });
    expect(byProp.app).toMatchObject({
      type: 'enum',
      values: ['Netflix', 'YouTube'],
    });
  });

  it('accepts a valid command and rejects out-of-contract values', () => {
    const actions = adapter.getAvailableActions(discovered.attributes);
    expect(
      adapter.validateCommand({ volume: 30, input: 'HDMI 1' }, actions).valid,
    ).toBe(true);
    expect(adapter.validateCommand({ volume: 500 }, actions).valid).toBe(false);
    expect(adapter.validateCommand({ input: 'HDMI 9' }, actions).valid).toBe(
      false,
    );
  });

  it('builds per-property command messages on the set topics', () => {
    const messages = adapter.buildCommandMessages(
      {
        homeUniqueId: HOME,
        deviceUniqueId: 'tv_salon',
        protocol: DeviceProtocol.WIFI,
        attributes: discovered.attributes,
      },
      { power: 'ON', volume: 25, app: 'Netflix' },
    );

    expect(messages).toContainEqual({
      topic: `${BASE}/set/power`,
      payload: 'ON',
    });
    expect(messages).toContainEqual({
      topic: `${BASE}/set/volume`,
      payload: '25',
    });
    expect(messages).toContainEqual({
      topic: `${BASE}/set/app`,
      payload: 'Netflix',
    });
  });

  it('exposes every state field as readable (shared aggregate ~/state)', () => {
    const readable = adapter.getReadableAttributes(discovered.attributes);
    const props = readable.map((r) => r.property).sort();
    expect(props).toEqual(['app', 'input', 'mute', 'power', 'volume']);
  });
});

describe("lan-bridge's own device (pairing switch) through the adapter", () => {
  const adapter = new HaDiscoveryAdapter();
  const bridgeBase = `home/id/${HOME}/wifi/lanbridge_home-uui`;
  const bridgeConfig = {
    dev: { ids: ['lanbridge_home-uui'], name: 'LAN Bridge', mdl: 'lan-bridge' },
    o: { name: 'lan-bridge' },
    '~': bridgeBase,
    avty_t: '~/availability',
    cmps: {
      pairing: {
        p: 'switch',
        name: 'Pairing mode',
        uniq_id: 'lanbridge_home-uui_pairing',
        stat_t: '~/state',
        val_tpl: '{{value_json.pairing}}',
        cmd_t: '~/set/pairing',
        pl_on: 'ON',
        pl_off: 'OFF',
      },
      devices: {
        p: 'sensor',
        name: 'Managed devices',
        uniq_id: 'lanbridge_home-uui_devices',
        stat_t: '~/state',
        val_tpl: '{{value_json.devices}}',
      },
      discovered: {
        p: 'sensor',
        name: 'Last discovery',
        uniq_id: 'lanbridge_home-uui_discovered',
        stat_t: '~/state',
        val_tpl: '{{value_json.discovered}}',
      },
      pairing_code: {
        p: 'text',
        name: 'Pairing code',
        uniq_id: 'lanbridge_home-uui_pairing_code',
        stat_t: '~/state',
        val_tpl: '{{value_json.pairing_code}}',
        cmd_t: '~/set/pairing_code',
      },
    },
  };

  const discovered = adapter.parseDiscovery({
    topicParts: ['device', 'lanbridge_home-uui', 'config'],
    payload: bridgeConfig,
  })!;

  it('registers as wifi with pairing switch + pairing_code text actions', () => {
    expect(discovered.protocol).toBe(DeviceProtocol.WIFI);
    const actions = adapter.getAvailableActions(discovered.attributes);
    const byProp = Object.fromEntries(actions.map((a) => [a.property, a]));
    expect(actions).toHaveLength(2);
    expect(byProp.pairing).toMatchObject({
      type: 'binary',
      valueOn: 'ON',
      valueOff: 'OFF',
    });
    expect(byProp.pairing_code).toMatchObject({ type: 'text' });
  });

  it('routes pairing + pairing_code commands to their set topics', () => {
    const actions = adapter.getAvailableActions(discovered.attributes);
    expect(adapter.validateCommand({ pairing: 'ON' }, actions).valid).toBe(true);
    expect(
      adapter.validateCommand({ pairing_code: '1A2B3C' }, actions).valid,
    ).toBe(true);
    const messages = adapter.buildCommandMessages(
      {
        homeUniqueId: HOME,
        deviceUniqueId: 'lanbridge_home-uui',
        protocol: DeviceProtocol.WIFI,
        attributes: discovered.attributes,
      },
      { pairing: 'ON', pairing_code: '1A2B3C' },
    );
    expect(messages).toContainEqual({
      topic: `${bridgeBase}/set/pairing`,
      payload: 'ON',
    });
    expect(messages).toContainEqual({
      topic: `${bridgeBase}/set/pairing_code`,
      payload: '1A2B3C',
    });
  });
});
