import {
  toCanonicalConfig,
  deriveEntities,
  deriveAvailability,
  deriveDeviceMeta,
} from './parse-ha-config';
import { HaDiscoveryAdapter } from './hadiscovery.adapter';
import { HaDeviceAttributes } from './ha-config.types';

const HOME = 'fe40902d-6b76-49e2-9b18-611f4599737e';

/** Real device-based (`cmps`) sound-sensor config from the domotic-ai firmware. */
const soundConfig = {
  '~': `home/id/${HOME}/wifi/sensor-62f11110`,
  dev: {
    ids: ['sensor-62f11110'],
    name: 'sensor-62f11110',
    mf: 'domotic-ai',
    mdl: 'domoticai-esp-sound',
    sw: '1.0',
    hw: 'xiao-esp32s3',
  },
  o: { name: 'domotic-ai-firmware', sw: '1.0', url: 'https://domotic-ai.com' },
  availability: [
    { topic: '~/availability', value_template: '{{value_json.state}}' },
  ],
  payload_available: 'online',
  payload_not_available: 'offline',
  stat_t: '~/state',
  cmps: {
    ts: {
      p: 'sensor',
      device_class: 'timestamp',
      value_template: '{{value_json.ts}}',
      unique_id: 'sensor-62f11110_ts',
    },
    noise_db: {
      p: 'sensor',
      device_class: 'sound_pressure',
      unit_of_measurement: 'dB',
      state_class: 'measurement',
      value_template: '{{value_json.noise_db}}',
      unique_id: 'sensor-62f11110_noise_db',
    },
    band_bass: {
      p: 'sensor',
      unit_of_measurement: '%',
      state_class: 'measurement',
      value_template: '{{(value_json.band_bass*100)|round(1)}}',
      unique_id: 'sensor-62f11110_band_bass',
    },
    wifi_rssi: {
      p: 'sensor',
      device_class: 'signal_strength',
      unit_of_measurement: 'dBm',
      state_class: 'measurement',
      value_template: '{{value_json.wifi_rssi}}',
      unique_id: 'sensor-62f11110_rssi',
    },
  },
};

const soundInput = {
  topicParts: ['device', 'sensor-62f11110', 'config'],
  payload: soundConfig,
};

describe('toCanonicalConfig — device-based stores the COMPLETE config', () => {
  const config = toCanonicalConfig(soundInput)!;

  it('keeps the full device block (sw/hw/mf/mdl) verbatim', () => {
    expect(config.dev).toEqual(soundConfig.dev);
  });

  it('keeps origin, availability and shared state topic', () => {
    expect(config.o).toEqual(soundConfig.o);
    expect(config.availability).toEqual(soundConfig.availability);
    expect(config.stat_t).toBe('~/state');
    expect(config['~']).toBe(soundConfig['~']);
  });

  it('keeps every component with all its raw fields (value_template, state_class)', () => {
    expect(Object.keys(config.cmps)).toHaveLength(4);
    expect(config.cmps.noise_db).toEqual(soundConfig.cmps.noise_db);
    expect(config.cmps.band_bass.value_template).toBe(
      '{{(value_json.band_bass*100)|round(1)}}',
    );
  });
});

describe('deriveEntities / deriveAvailability — read-time derivation', () => {
  const config = toCanonicalConfig(soundInput)!;
  const entities = deriveEntities(config);

  it('resolves `~/state` and rich metadata for each component', () => {
    const noise = entities.find((e) => e.property === 'noise_db')!;
    expect(noise.component).toBe('sensor');
    expect(noise.deviceClass).toBe('sound_pressure');
    expect(noise.unit).toBe('dB');
    expect(noise.stateClass).toBe('measurement');
    expect(noise.stateTopic).toBe(`home/id/${HOME}/wifi/sensor-62f11110/state`);
    expect(noise.uniqueId).toBe('sensor-62f11110_noise_db');
    expect(noise.hasTemplate).toBe(true);
  });

  it('keeps property = object id even with an expression template', () => {
    const band = entities.find((e) => e.uniqueId === 'sensor-62f11110_band_bass')!;
    expect(band.property).toBe('band_bass');
  });

  it('derives the device meta and the resolved availability topic', () => {
    expect(deriveDeviceMeta(config)).toMatchObject({
      identifiers: 'sensor-62f11110',
      model: 'domoticai-esp-sound',
      manufacturer: 'domotic-ai',
    });
    expect(deriveAvailability(config)).toEqual({
      topic: `home/id/${HOME}/wifi/sensor-62f11110/availability`,
      field: 'state',
      payloadOnline: 'online',
      payloadOffline: 'offline',
    });
  });
});

describe('HaDiscoveryAdapter — stores raw config, derives capabilities', () => {
  const adapter = new HaDiscoveryAdapter();
  const discovered = adapter.parseDiscovery(soundInput)!;
  const attrs = discovered.attributes as HaDeviceAttributes;

  it('persists { source, protocol, config } with the complete config', () => {
    expect(discovered.protocol).toBe('wifi');
    expect(attrs.source).toBe('hadiscovery');
    expect(attrs.protocol).toBe('wifi');
    expect(Object.keys(attrs.config.cmps)).toHaveLength(4);
    expect(attrs.config.dev).toEqual(soundConfig.dev);
  });

  it('exposes sensors as readable, omits `ts` metadata, no actions', () => {
    const readable = adapter.getReadableAttributes(attrs);
    const props = readable.map((r) => r.property);
    expect(props).toContain('noise_db');
    expect(props).not.toContain('ts');
    expect(adapter.getAvailableActions(attrs)).toHaveLength(0);
  });
});

describe('per-entity classic — wrapped into cmps without loss', () => {
  const adapter = new HaDiscoveryAdapter();
  const input = {
    topicParts: ['switch', 'node12', 'relay', 'config'],
    payload: {
      '~': `home/id/${HOME}/zwave/node12`,
      name: 'Relay',
      uniq_id: 'zwave_node12_relay',
      stat_t: '~/state',
      cmd_t: '~/set',
      pl_on: 'ON',
      pl_off: 'OFF',
      dev: { ids: ['zwave_node12'], name: 'Node 12' },
    },
  };

  it('wraps the entity under cmps and derives a controllable action', () => {
    const config = toCanonicalConfig(input)!;
    expect(Object.keys(config.cmps)).toEqual(['relay']);
    // device-level keys lifted; entity keys preserved under the component.
    expect(config['~']).toBe(`home/id/${HOME}/zwave/node12`);
    expect(config.cmps.relay.cmd_t).toBe('~/set');

    const discovered = adapter.parseDiscovery(input)!;
    expect(discovered.protocol).toBe('zwave');
    const entity = deriveEntities(
      (discovered.attributes as HaDeviceAttributes).config,
    )[0];
    expect(entity.property).toBe('relay');
    expect(entity.commandTopic).toBe(`home/id/${HOME}/zwave/node12/set`);
    expect(entity.payloadOn).toBe('ON');
    expect(adapter.getAvailableActions(discovered.attributes)).toHaveLength(1);
  });
});

describe('mergeDiscovery — additive on cmps', () => {
  const adapter = new HaDiscoveryAdapter();
  it('merges components and keeps both, superseding by object id', () => {
    const first = adapter.parseDiscovery(soundInput)!;
    const second = adapter.parseDiscovery({
      topicParts: ['device', 'sensor-62f11110', 'config'],
      payload: {
        ...soundConfig,
        cmps: {
          noise_db: {
            ...soundConfig.cmps.noise_db,
            unit_of_measurement: 'dBA', // updated unit
          },
          extra: {
            p: 'sensor',
            value_template: '{{value_json.extra}}',
            unique_id: 'sensor-62f11110_extra',
          },
        },
      },
    })!;
    const merged = adapter.mergeDiscovery(
      first.attributes,
      second,
    ) as HaDeviceAttributes;
    expect(Object.keys(merged.config.cmps).sort()).toEqual([
      'band_bass',
      'extra',
      'noise_db',
      'ts',
      'wifi_rssi',
    ]);
    expect(merged.config.cmps.noise_db.unit_of_measurement).toBe('dBA');
  });
});

describe('edge cases', () => {
  it('returns null for an empty payload', () => {
    expect(
      toCanonicalConfig({ topicParts: ['device', 'x', 'config'], payload: {} }),
    ).toBeNull();
  });

  it('returns null when a device-based config has no usable components', () => {
    expect(
      toCanonicalConfig({
        topicParts: ['device', 'x', 'config'],
        payload: { '~': `home/id/${HOME}/wifi/x`, cmps: { gone: {} } },
      }),
    ).toBeNull();
  });
});
