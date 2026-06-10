import { toCanonicalConfig, deriveEntities } from './parse-ha-config';
import { transformAggregateState } from './transform-ha-state';
import { HaEntity } from './ha-config.types';

const HOME = 'fe40902d-6b76-49e2-9b18-611f4599737e';
const TOPIC = `home/id/${HOME}/wifi/sensor-62f11110/state`;

/** Entities derived from the real sound-sensor discovery config. */
const entities = deriveEntities(
  toCanonicalConfig({
    topicParts: ['device', 'sensor-62f11110', 'config'],
    payload: {
      '~': `home/id/${HOME}/wifi/sensor-62f11110`,
      dev: { ids: ['sensor-62f11110'], name: 'sensor-62f11110' },
      stat_t: '~/state',
      cmps: {
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
        sound_class: {
          p: 'sensor',
          value_template: '{{value_json.sound_class}}',
          unique_id: 'sensor-62f11110_sound_class',
        },
      },
    },
  })!,
);

describe('transformAggregateState — real sound-sensor config', () => {
  const message = {
    ts: 1765400000,
    noise_db: 42.1,
    band_bass: 0.254,
    sound_class: 'speech',
    extra_unknown: 'raw',
  };
  const out = transformAggregateState(
    message,
    entities,
    TOPIC,
    JSON.stringify(message),
  );

  it('applies expression templates (band_bass ×100, rounded)', () => {
    expect(out.band_bass).toBe(25.4);
  });

  it('keeps identity-template fields unchanged', () => {
    expect(out.noise_db).toBe(42.1);
    expect(out.sound_class).toBe('speech');
  });

  it('passes meta and unknown keys through raw', () => {
    expect(out.ts).toBe(1765400000);
    expect(out.extra_unknown).toBe('raw');
  });

  it('returns a new object without mutating the input', () => {
    expect(out).not.toBe(message);
    expect(message.band_bass).toBe(0.254);
  });
});

describe('transformAggregateState — topic and field matching', () => {
  it('leaves the message untouched for a different state topic', () => {
    const message = { band_bass: 0.254 };
    const out = transformAggregateState(
      message,
      entities,
      `home/id/${HOME}/wifi/other/state`,
      JSON.stringify(message),
    );
    expect(out).toEqual(message);
  });

  it('writes under the entity property when the template references another field', () => {
    const aliased: HaEntity[] = [
      {
        component: 'sensor',
        property: 'rssi',
        uniqueId: 'd_rssi',
        stateTopic: TOPIC,
        valueTemplate: '{{value_json.wifi_rssi}}',
      },
    ];
    const out = transformAggregateState(
      { wifi_rssi: -55 },
      aliased,
      TOPIC,
      '{"wifi_rssi":-55}',
    );
    expect(out.rssi).toBe(-55);
    expect(out.wifi_rssi).toBe(-55);
  });

  it('skips silently when the referenced field is absent from this payload', () => {
    const onFallback = jest.fn();
    const out = transformAggregateState(
      { other: 1 },
      entities,
      TOPIC,
      '{"other":1}',
      onFallback,
    );
    expect(out).toEqual({ other: 1 });
    expect(onFallback).not.toHaveBeenCalled();
  });

  it('keeps the raw value and reports when an unsupported template fails', () => {
    const broken: HaEntity[] = [
      {
        component: 'sensor',
        property: 'x',
        uniqueId: 'd_x',
        stateTopic: TOPIC,
        valueTemplate: '{{ value_json.x | is_defined }}',
      },
    ];
    const onFallback = jest.fn();
    const out = transformAggregateState(
      { x: 5 },
      broken,
      TOPIC,
      '{"x":5}',
      onFallback,
    );
    expect(out.x).toBe(5);
    expect(onFallback).toHaveBeenCalledWith(
      'x',
      '{{ value_json.x | is_defined }}',
    );
  });
});

describe('transformAggregateState — state_class numeric coercion', () => {
  it('coerces numeric strings for measurement entities', () => {
    const out = transformAggregateState(
      { noise_db: '42.1' },
      entities,
      TOPIC,
      '{"noise_db":"42.1"}',
    );
    expect(out.noise_db).toBe(42.1);
  });

  it('keeps non-castable measurement values raw and reports them', () => {
    const onFallback = jest.fn();
    const out = transformAggregateState(
      { noise_db: 'abc' },
      entities,
      TOPIC,
      '{"noise_db":"abc"}',
      onFallback,
    );
    expect(out.noise_db).toBe('abc');
    expect(onFallback).toHaveBeenCalled();
  });
});
