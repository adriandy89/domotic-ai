import type { AlexaProperty } from './alexa.types';
import type { MappedFeatures } from './capability-mapper';
import { makeProperty } from './alexa-response';
import { xyToHsb } from './color-convert';

/**
 * Pure projection `SensorDataLast.data` → Alexa context properties. Used by
 * the synchronous StateReport (v1) and reusable by the proactive
 * ChangeReporter (v2).
 */
export function projectProperties(
  features: MappedFeatures,
  data: Record<string, unknown>,
  online: boolean,
): AlexaProperty[] {
  const props: AlexaProperty[] = [];

  if (features.onOff) {
    const on = matchesBinary(data[features.onOff.property], features.onOff);
    if (on !== null) {
      props.push(
        makeProperty('Alexa.PowerController', 'powerState', on ? 'ON' : 'OFF'),
      );
    }
  }

  if (features.brightness) {
    const raw = asNumber(data[features.brightness.property]);
    if (raw !== null) {
      const max = features.brightness.valueMax ?? 254;
      props.push(
        makeProperty(
          'Alexa.BrightnessController',
          'brightness',
          clamp(Math.round((raw / max) * 100), 0, 100),
        ),
      );
    }
  }

  if (features.color) {
    const hsb = colorToHsb(
      data[features.color.property],
      asNumber(data[features.brightness?.property ?? 'brightness']),
      features.brightness?.valueMax ?? 254,
    );
    if (hsb) props.push(makeProperty('Alexa.ColorController', 'color', hsb));
  }

  if (features.colorTemp) {
    const raw = asNumber(data[features.colorTemp.property]);
    if (raw !== null && raw > 0) {
      // Devices report mireds; anything above 1000 is already Kelvin.
      const kelvin = raw > 1000 ? Math.round(raw) : Math.round(1_000_000 / raw);
      props.push(
        makeProperty(
          'Alexa.ColorTemperatureController',
          'colorTemperatureInKelvin',
          kelvin,
        ),
      );
    }
  }

  if (features.thermostatMode && features.setpoint) {
    const mode = data[features.thermostatMode.property];
    if (typeof mode === 'string' && mode) {
      props.push(
        makeProperty(
          'Alexa.ThermostatController',
          'thermostatMode',
          mode.toUpperCase(),
        ),
      );
    }
    const setpoint = asNumber(data[features.setpoint.property]);
    if (setpoint !== null) {
      props.push(
        makeProperty('Alexa.ThermostatController', 'targetSetpoint', {
          value: setpoint,
          scale: 'CELSIUS',
        }),
      );
    }
  }

  if (features.lock) {
    const locked = matchesBinary(data[features.lock.property], features.lock);
    if (locked !== null) {
      props.push(
        makeProperty(
          'Alexa.LockController',
          'lockState',
          locked ? 'LOCKED' : 'UNLOCKED',
        ),
      );
    }
  }

  if (features.temperature) {
    const value = asNumber(data[features.temperature.property]);
    if (value !== null) {
      props.push(
        makeProperty('Alexa.TemperatureSensor', 'temperature', {
          value,
          scale: 'CELSIUS',
        }),
      );
    }
  }

  if (features.contact) {
    const closed = coerceBinary(data[features.contact.property]);
    if (closed !== null) {
      // zigbee2mqtt semantics: contact=true means closed → Alexa DETECTED = open.
      props.push(
        makeProperty(
          'Alexa.ContactSensor',
          'detectionState',
          closed ? 'NOT_DETECTED' : 'DETECTED',
        ),
      );
    }
  }

  if (features.motion) {
    const active = coerceBinary(data[features.motion.property]);
    if (active !== null) {
      props.push(
        makeProperty(
          'Alexa.MotionSensor',
          'detectionState',
          active ? 'DETECTED' : 'NOT_DETECTED',
        ),
      );
    }
  }

  props.push(
    makeProperty('Alexa.EndpointHealth', 'connectivity', {
      value: online ? 'OK' : 'UNREACHABLE',
    }),
  );

  return props;
}

/** Compare a reported value against the action's valueOn/valueOff. */
function matchesBinary(
  value: unknown,
  action: { valueOn?: unknown; valueOff?: unknown },
): boolean | null {
  if (value === undefined || value === null) return null;
  if (action.valueOn !== undefined && value === action.valueOn) return true;
  if (action.valueOff !== undefined && value === action.valueOff) return false;
  return coerceBinary(value);
}

function coerceBinary(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.toLowerCase();
    if (['on', 'true', '1', 'open', 'lock', 'locked'].includes(v)) return true;
    if (['off', 'false', '0', 'closed', 'unlock', 'unlocked'].includes(v)) {
      return false;
    }
  }
  return null;
}

function colorToHsb(
  value: unknown,
  brightnessRaw: number | null,
  brightnessMax: number,
): { hue: number; saturation: number; brightness: number } | null {
  if (!value || typeof value !== 'object') return null;
  const color = value as Record<string, unknown>;
  const brightness =
    brightnessRaw !== null
      ? Math.min(1, Math.max(0, brightnessRaw / brightnessMax))
      : 1;
  const hue = asNumber(color.hue ?? color.h);
  const saturation = asNumber(color.saturation ?? color.s);
  if (hue !== null && saturation !== null) {
    // zigbee hs: saturation 0–100
    return {
      hue,
      saturation: saturation > 1 ? saturation / 100 : saturation,
      brightness,
    };
  }
  const x = asNumber(color.x);
  const y = asNumber(color.y);
  if (x !== null && y !== null) return xyToHsb(x, y, brightness);
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value !== '' && !Number.isNaN(+value)) {
    return +value;
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
