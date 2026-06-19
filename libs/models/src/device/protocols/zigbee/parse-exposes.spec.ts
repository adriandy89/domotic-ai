import { getAvailableActions } from './parse-exposes';
import { validateCommand } from '../shared/validate-command';
import { DeviceExpose, ACCESS_SET } from './exposes.types';

/** Mirrors zigbee2mqtt's TS0224 siren `warning` composite (a write-only command). */
const warningComposite: DeviceExpose = {
  type: 'composite',
  name: 'warning',
  property: 'warning',
  label: 'Warning',
  access: ACCESS_SET,
  features: [
    {
      type: 'enum',
      name: 'mode',
      property: 'mode',
      access: ACCESS_SET,
      values: ['stop', 'burglar', 'fire', 'emergency'],
    },
    {
      type: 'enum',
      name: 'level',
      property: 'level',
      access: ACCESS_SET,
      values: ['low', 'medium', 'high', 'very_high'],
    },
    {
      type: 'binary',
      name: 'strobe',
      property: 'strobe',
      access: ACCESS_SET,
      value_on: true,
      value_off: false,
    },
    {
      type: 'numeric',
      name: 'duration',
      property: 'duration',
      access: ACCESS_SET,
      value_min: 0,
      value_max: 1800,
    },
  ],
};

describe('getAvailableActions — composite exposes', () => {
  it('emits ONE composite action carrying its writable sub-features (not flattened)', () => {
    const actions = getAvailableActions([warningComposite]);

    expect(actions).toHaveLength(1);
    const warning = actions[0];
    expect(warning.property).toBe('warning');
    expect(warning.type).toBe('composite');
    expect(warning.features?.map((f) => f.property)).toEqual([
      'mode',
      'level',
      'strobe',
      'duration',
    ]);
    // Sub-features must NOT leak as independent top-level actions.
    expect(actions.some((a) => a.property === 'strobe')).toBe(false);
  });

  it('still collapses color composites into a single `color` action', () => {
    const colorXy: DeviceExpose = {
      type: 'composite',
      name: 'color_xy',
      property: 'color',
      features: [
        { type: 'numeric', name: 'x', property: 'x', access: ACCESS_SET },
        { type: 'numeric', name: 'y', property: 'y', access: ACCESS_SET },
      ],
    };
    const actions = getAvailableActions([colorXy]);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('color');
    expect(actions[0].property).toBe('color');
  });

  it('keeps flattening non-composite wrappers (e.g. light)', () => {
    const light: DeviceExpose = {
      type: 'light',
      features: [
        {
          type: 'binary',
          name: 'state',
          property: 'state',
          access: ACCESS_SET,
          value_on: 'ON',
          value_off: 'OFF',
        },
        {
          type: 'numeric',
          name: 'brightness',
          property: 'brightness',
          access: ACCESS_SET,
          value_min: 0,
          value_max: 254,
        },
      ],
    };
    const actions = getAvailableActions([light]);
    expect(actions.map((a) => a.property).sort()).toEqual([
      'brightness',
      'state',
    ]);
  });
});

describe('validateCommand — composite exposes', () => {
  const actions = getAvailableActions([warningComposite]);

  it('accepts a valid nested composite command', () => {
    const res = validateCommand(
      { warning: { mode: 'emergency', strobe: true, duration: 10 } },
      actions,
    );
    expect(res.valid).toBe(true);
  });

  it('rejects a non-object composite value', () => {
    const res = validateCommand({ warning: 'emergency' }, actions);
    expect(res.valid).toBe(false);
  });

  it('rejects an invalid sub-value, namespaced under the composite', () => {
    const res = validateCommand(
      { warning: { mode: 'nope', duration: 99999 } },
      actions,
    );
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.some((e) => e.property.startsWith('warning.'))).toBe(
        true,
      );
    }
  });

  it('ignores unknown sub-properties (lenient)', () => {
    const res = validateCommand({ warning: { mode: 'fire', bogus: 1 } }, actions);
    expect(res.valid).toBe(true);
  });

  it('no longer accepts the old flattened sub-property at the top level', () => {
    const res = validateCommand({ strobe: true }, actions);
    expect(res.valid).toBe(false);
  });
});
