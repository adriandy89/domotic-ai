import type { MappedFeatures } from './capability-mapper';
import { projectProperties } from './alexa-state';

const light: MappedFeatures = {
  onOff: { property: 'state', type: 'binary', valueOn: 'ON', valueOff: 'OFF' },
  brightness: {
    property: 'brightness',
    type: 'numeric',
    valueMin: 0,
    valueMax: 254,
  },
  colorTemp: { property: 'color_temp', type: 'numeric' },
};

function byName(props: { namespace: string; name: string; value: unknown }[]) {
  return Object.fromEntries(props.map((p) => [p.name, p.value]));
}

describe('projectProperties', () => {
  it('projects power, brightness (0–100) and Kelvin from mireds', () => {
    const props = byName(
      projectProperties(light, { state: 'ON', brightness: 127, color_temp: 370 }, true),
    );
    expect(props.powerState).toBe('ON');
    expect(props.brightness).toBe(50);
    expect(props.colorTemperatureInKelvin).toBe(2703);
    expect(props.connectivity).toEqual({ value: 'OK' });
  });

  it('skips properties with no reported value and flags offline devices', () => {
    const props = projectProperties(light, {}, false);
    expect(props).toHaveLength(1);
    expect(props[0]).toMatchObject({
      name: 'connectivity',
      value: { value: 'UNREACHABLE' },
    });
  });

  it('inverts zigbee contact semantics (true=closed → NOT_DETECTED)', () => {
    const sensor: MappedFeatures = {
      contact: { property: 'contact', type: 'binary' },
    };
    expect(
      byName(projectProperties(sensor, { contact: true }, true)).detectionState,
    ).toBe('NOT_DETECTED');
    expect(
      byName(projectProperties(sensor, { contact: false }, true)).detectionState,
    ).toBe('DETECTED');
  });

  it('reports occupancy directly and temperature in Celsius', () => {
    const sensor: MappedFeatures = {
      motion: { property: 'occupancy', type: 'binary' },
      temperature: { property: 'temperature', type: 'numeric' },
    };
    const props = byName(
      projectProperties(sensor, { occupancy: true, temperature: 21.4 }, true),
    );
    expect(props.detectionState).toBe('DETECTED');
    expect(props.temperature).toEqual({ value: 21.4, scale: 'CELSIUS' });
  });

  it('reports lock state from the lock action values', () => {
    const lock: MappedFeatures = {
      lock: {
        property: 'state',
        type: 'binary',
        valueOn: 'LOCK',
        valueOff: 'UNLOCK',
      },
    };
    expect(
      byName(projectProperties(lock, { state: 'LOCK' }, true)).lockState,
    ).toBe('LOCKED');
    expect(
      byName(projectProperties(lock, { state: 'UNLOCK' }, true)).lockState,
    ).toBe('UNLOCKED');
  });

  it('reports color as HSB from zigbee xy + brightness', () => {
    const colorLight: MappedFeatures = {
      ...light,
      color: { property: 'color', type: 'color', colorFormats: ['xy'] },
    };
    const props = byName(
      projectProperties(
        colorLight,
        { color: { x: 0.675, y: 0.322 }, brightness: 254 },
        true,
      ),
    );
    const color = props.color as { hue: number; saturation: number; brightness: number };
    expect(color.brightness).toBe(1);
    expect(color.saturation).toBeGreaterThan(0.9);
    expect(color.hue).toBeGreaterThanOrEqual(0);
    expect(color.hue).toBeLessThan(30); // red-ish
  });
});
