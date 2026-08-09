import type { MappedFeatures } from './capability-mapper';
import { directiveToCommand } from './directive-to-command';

const light: MappedFeatures = {
  onOff: { property: 'state', type: 'binary', valueOn: 'ON', valueOff: 'OFF' },
  brightness: {
    property: 'brightness',
    type: 'numeric',
    valueMin: 0,
    valueMax: 254,
  },
  color: { property: 'color', type: 'color', colorFormats: ['xy'] },
  colorTemp: {
    property: 'color_temp',
    type: 'numeric',
    valueMin: 150,
    valueMax: 500,
  },
};

function run(
  namespace: string,
  name: string,
  payload: Record<string, any> = {},
  features: MappedFeatures = light,
  currentData: Record<string, unknown> = {},
) {
  return directiveToCommand({ namespace, name, payload, features, currentData });
}

describe('directiveToCommand', () => {
  it('TurnOn/TurnOff use the binary action values', () => {
    expect(run('Alexa.PowerController', 'TurnOn')).toEqual({
      ok: true,
      command: { state: 'ON' },
    });
    expect(run('Alexa.PowerController', 'TurnOff')).toEqual({
      ok: true,
      command: { state: 'OFF' },
    });
  });

  it('SetBrightness scales 0–100 to the device range', () => {
    expect(run('Alexa.BrightnessController', 'SetBrightness', { brightness: 50 }))
      .toEqual({ ok: true, command: { brightness: 127 } });
    expect(run('Alexa.BrightnessController', 'SetBrightness', { brightness: 100 }))
      .toEqual({ ok: true, command: { brightness: 254 } });
    const invalid = run('Alexa.BrightnessController', 'SetBrightness', {
      brightness: 150,
    });
    expect(invalid).toMatchObject({ ok: false, errorType: 'INVALID_VALUE' });
  });

  it('AdjustBrightness applies the delta to the last reported value', () => {
    const result = run(
      'Alexa.BrightnessController',
      'AdjustBrightness',
      { brightnessDelta: -25 },
      light,
      { brightness: 200 },
    );
    expect(result).toEqual({ ok: true, command: { brightness: 137 } });
  });

  it('AdjustBrightness without a known current state fails gracefully', () => {
    const result = run('Alexa.BrightnessController', 'AdjustBrightness', {
      brightnessDelta: 10,
    });
    expect(result).toMatchObject({ ok: false, errorType: 'INTERNAL_ERROR' });
  });

  it('SetColor converts HSB to a hex command the adapter finalizes', () => {
    const result = run('Alexa.ColorController', 'SetColor', {
      color: { hue: 0, saturation: 1, brightness: 1 },
    });
    expect(result).toEqual({ ok: true, command: { color: { hex: '#ff0000' } } });
  });

  it('SetColorTemperature passes Kelvin through untouched', () => {
    const result = run(
      'Alexa.ColorTemperatureController',
      'SetColorTemperature',
      { colorTemperatureInKelvin: 2700 },
    );
    expect(result).toEqual({ ok: true, command: { color_temp: 2700 } });
  });

  it('SetThermostatMode matches the platform enum case-insensitively', () => {
    const thermostat: MappedFeatures = {
      thermostatMode: {
        property: 'system_mode',
        type: 'enum',
        values: ['off', 'heat', 'auto'],
      },
      setpoint: {
        property: 'occupied_heating_setpoint',
        type: 'numeric',
      },
    };
    expect(
      run('Alexa.ThermostatController', 'SetThermostatMode', {
        thermostatMode: { value: 'HEAT' },
      }, thermostat),
    ).toEqual({ ok: true, command: { system_mode: 'heat' } });
    expect(
      run('Alexa.ThermostatController', 'SetThermostatMode', {
        thermostatMode: { value: 'COOL' },
      }, thermostat),
    ).toMatchObject({ ok: false, errorType: 'INVALID_VALUE' });
  });

  it('SetTargetTemperature converts Fahrenheit to Celsius', () => {
    const thermostat: MappedFeatures = {
      setpoint: { property: 'occupied_heating_setpoint', type: 'numeric' },
    };
    expect(
      run('Alexa.ThermostatController', 'SetTargetTemperature', {
        targetSetpoint: { value: 71.6, scale: 'FAHRENHEIT' },
      }, thermostat),
    ).toEqual({ ok: true, command: { occupied_heating_setpoint: 22 } });
    expect(
      run('Alexa.ThermostatController', 'SetTargetTemperature', {
        targetSetpoint: { value: 21.5, scale: 'CELSIUS' },
      }, thermostat),
    ).toEqual({ ok: true, command: { occupied_heating_setpoint: 21.5 } });
  });

  it('Lock/Unlock map to the lock action values', () => {
    const lockFeatures: MappedFeatures = {
      lock: {
        property: 'state',
        type: 'binary',
        valueOn: 'LOCK',
        valueOff: 'UNLOCK',
      },
    };
    expect(run('Alexa.LockController', 'Lock', {}, lockFeatures)).toEqual({
      ok: true,
      command: { state: 'LOCK' },
    });
    expect(run('Alexa.LockController', 'Unlock', {}, lockFeatures)).toEqual({
      ok: true,
      command: { state: 'UNLOCK' },
    });
  });

  it('rejects directives the endpoint does not support', () => {
    const result = run('Alexa.PowerController', 'TurnOn', {}, {});
    expect(result).toMatchObject({ ok: false, errorType: 'INVALID_DIRECTIVE' });
  });
});
