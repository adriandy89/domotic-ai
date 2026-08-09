import type { DeviceAction, DeviceReadableAttribute } from '@app/models';
import { decodeEndpointId, encodeEndpointId } from './alexa.types';
import { mapCapabilities, sceneCapabilities } from './capability-mapper';

const stateAction: DeviceAction = {
  property: 'state',
  type: 'binary',
  valueOn: 'ON',
  valueOff: 'OFF',
  valueToggle: 'TOGGLE',
};
const brightnessAction: DeviceAction = {
  property: 'brightness',
  type: 'numeric',
  valueMin: 0,
  valueMax: 254,
};
const colorAction: DeviceAction = {
  property: 'color',
  type: 'color',
  colorFormats: ['xy'],
};
const colorTempAction: DeviceAction = {
  property: 'color_temp',
  type: 'numeric',
  valueMin: 150,
  valueMax: 500,
};

function interfaces(mapping: ReturnType<typeof mapCapabilities>) {
  return mapping!.capabilities.map((c) => c.interface);
}

describe('mapCapabilities', () => {
  it('maps a color light to LIGHT with power/brightness/color/colorTemp', () => {
    const mapping = mapCapabilities(
      [stateAction, brightnessAction, colorAction, colorTempAction],
      [],
    );
    expect(mapping!.displayCategories).toEqual(['LIGHT']);
    expect(interfaces(mapping)).toEqual(
      expect.arrayContaining([
        'Alexa.PowerController',
        'Alexa.BrightnessController',
        'Alexa.ColorController',
        'Alexa.ColorTemperatureController',
        'Alexa.EndpointHealth',
        'Alexa',
      ]),
    );
    expect(mapping!.features.onOff).toBe(stateAction);
  });

  it('maps a plug (switch + energy readable) to SMARTPLUG', () => {
    const readables: DeviceReadableAttribute[] = [
      { property: 'power', type: 'numeric', unit: 'W' },
      { property: 'energy', type: 'numeric', unit: 'kWh' },
    ];
    const mapping = mapCapabilities([stateAction], readables);
    expect(mapping!.displayCategories).toEqual(['SMARTPLUG']);
    expect(interfaces(mapping)).toContain('Alexa.PowerController');
  });

  it('maps a bare switch to SWITCH', () => {
    const mapping = mapCapabilities([stateAction], []);
    expect(mapping!.displayCategories).toEqual(['SWITCH']);
  });

  it('maps a lock (state LOCK/UNLOCK) to SMARTLOCK, not PowerController', () => {
    const lock: DeviceAction = {
      property: 'state',
      type: 'binary',
      valueOn: 'LOCK',
      valueOff: 'UNLOCK',
    };
    const mapping = mapCapabilities([lock], []);
    expect(mapping!.displayCategories).toEqual(['SMARTLOCK']);
    expect(interfaces(mapping)).toContain('Alexa.LockController');
    expect(interfaces(mapping)).not.toContain('Alexa.PowerController');
  });

  it('maps a thermostat (system_mode + setpoint) with supported modes', () => {
    const mode: DeviceAction = {
      property: 'system_mode',
      type: 'enum',
      values: ['off', 'heat', 'auto'],
    };
    const setpoint: DeviceAction = {
      property: 'occupied_heating_setpoint',
      type: 'numeric',
      valueMin: 5,
      valueMax: 30,
    };
    const readables: DeviceReadableAttribute[] = [
      { property: 'temperature', type: 'numeric', unit: '°C' },
    ];
    const mapping = mapCapabilities([mode, setpoint], readables);
    expect(mapping!.displayCategories).toEqual([
      'THERMOSTAT',
      'TEMPERATURE_SENSOR',
    ]);
    const thermostat = mapping!.capabilities.find(
      (c) => c.interface === 'Alexa.ThermostatController',
    );
    expect(thermostat!.configuration).toEqual({
      supportedModes: ['HEAT', 'AUTO', 'OFF'],
      supportsScheduling: false,
    });
    expect(interfaces(mapping)).toContain('Alexa.TemperatureSensor');
  });

  it('maps a media device (power+volume+input) to TV', () => {
    const actions: DeviceAction[] = [
      { property: 'power', type: 'binary', valueOn: 'ON', valueOff: 'OFF' },
      { property: 'volume', type: 'numeric', valueMin: 0, valueMax: 100 },
      { property: 'input', type: 'enum', values: ['hdmi1', 'hdmi2'] },
    ];
    const mapping = mapCapabilities(actions, []);
    expect(mapping!.displayCategories).toEqual(['TV']);
  });

  it('maps contact/motion sensors', () => {
    const readables: DeviceReadableAttribute[] = [
      { property: 'contact', type: 'binary' },
      { property: 'occupancy', type: 'binary' },
    ];
    const mapping = mapCapabilities([], readables);
    expect(mapping!.displayCategories).toEqual([
      'CONTACT_SENSOR',
      'MOTION_SENSOR',
    ]);
    expect(interfaces(mapping)).toEqual(
      expect.arrayContaining(['Alexa.ContactSensor', 'Alexa.MotionSensor']),
    );
  });

  it('returns null when nothing maps', () => {
    const readables: DeviceReadableAttribute[] = [
      { property: 'linkquality', type: 'numeric' },
    ];
    expect(mapCapabilities([], readables)).toBeNull();
  });

  it('announces retrievable, non-proactive properties (v1)', () => {
    const mapping = mapCapabilities([stateAction], []);
    const power = mapping!.capabilities.find(
      (c) => c.interface === 'Alexa.PowerController',
    );
    expect(power!.properties).toEqual({
      supported: [{ name: 'powerState' }],
      proactivelyReported: false,
      retrievable: true,
    });
  });
});

describe('sceneCapabilities', () => {
  it('is a non-deactivatable SceneController', () => {
    const caps = sceneCapabilities();
    expect(caps[0]).toMatchObject({
      interface: 'Alexa.SceneController',
      supportsDeactivation: false,
    });
  });
});

describe('endpointId codec', () => {
  it('round-trips device and ir refs', () => {
    expect(decodeEndpointId(encodeEndpointId({ kind: 'device', id: 'abc' })))
      .toEqual({ kind: 'device', id: 'abc' });
    expect(decodeEndpointId(encodeEndpointId({ kind: 'ir', id: 'xyz' })))
      .toEqual({ kind: 'ir', id: 'xyz' });
  });

  it('rejects malformed ids', () => {
    expect(decodeEndpointId('dev:')).toBeNull();
    expect(decodeEndpointId('nope:123')).toBeNull();
    expect(decodeEndpointId('')).toBeNull();
  });
});
