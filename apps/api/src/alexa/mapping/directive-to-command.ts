import type { MappedFeatures } from './capability-mapper';
import { hsbToHex, type AlexaColor } from './color-convert';

export type DirectiveCommandResult =
  | { ok: true; command: Record<string, unknown> }
  | { ok: false; errorType: string; message: string };

/**
 * Pure translation of a control directive into the platform command that
 * `executeOneCommand` accepts (the protocol adapter then normalizes hex
 * colors and Kelvin values to the device's native representation).
 */
export function directiveToCommand(input: {
  namespace: string;
  name: string;
  payload: Record<string, any>;
  features: MappedFeatures;
  /** Last reported state — needed by relative adjustments. */
  currentData: Record<string, unknown>;
}): DirectiveCommandResult {
  const { namespace, name, payload, features, currentData } = input;

  switch (namespace) {
    case 'Alexa.PowerController': {
      if (!features.onOff) return unsupported(namespace);
      const value =
        name === 'TurnOn' ? features.onOff.valueOn : features.onOff.valueOff;
      if (value === undefined) return unsupported(namespace);
      return ok({ [features.onOff.property]: value });
    }

    case 'Alexa.BrightnessController': {
      if (!features.brightness) return unsupported(namespace);
      const max = features.brightness.valueMax ?? 254;
      const min = features.brightness.valueMin ?? 0;
      if (name === 'SetBrightness') {
        const percent = asNumber(payload.brightness);
        if (percent === null || percent < 0 || percent > 100) {
          return invalidValue('brightness must be 0–100');
        }
        return ok({
          [features.brightness.property]: clamp(
            Math.round((percent / 100) * max),
            min,
            max,
          ),
        });
      }
      if (name === 'AdjustBrightness') {
        const delta = asNumber(payload.brightnessDelta);
        if (delta === null) return invalidValue('brightnessDelta missing');
        const current = asNumber(currentData[features.brightness.property]);
        if (current === null) {
          return {
            ok: false,
            errorType: 'INTERNAL_ERROR',
            message: 'Current brightness unknown; use an absolute value',
          };
        }
        const next = current + Math.round((delta / 100) * max);
        return ok({
          [features.brightness.property]: clamp(next, min, max),
        });
      }
      return unsupported(`${namespace}.${name}`);
    }

    case 'Alexa.ColorController': {
      if (!features.color || name !== 'SetColor') return unsupported(namespace);
      const color = payload.color as AlexaColor | undefined;
      if (
        !color ||
        asNumber(color.hue) === null ||
        asNumber(color.saturation) === null ||
        asNumber(color.brightness) === null
      ) {
        return invalidValue('color must be {hue, saturation, brightness}');
      }
      return ok({ [features.color.property]: { hex: hsbToHex(color) } });
    }

    case 'Alexa.ColorTemperatureController': {
      if (!features.colorTemp || name !== 'SetColorTemperature') {
        return unsupported(`${namespace}.${name}`);
      }
      const kelvin = asNumber(payload.colorTemperatureInKelvin);
      if (kelvin === null || kelvin < 1000 || kelvin > 10000) {
        return invalidValue('colorTemperatureInKelvin must be 1000–10000');
      }
      // Kelvin passes through as-is; the adapter converts >1000 to mireds.
      return ok({ [features.colorTemp.property]: Math.round(kelvin) });
    }

    case 'Alexa.ThermostatController': {
      if (name === 'SetTargetTemperature') {
        if (!features.setpoint) return unsupported(namespace);
        const target = payload.targetSetpoint as
          | { value: number; scale: string }
          | undefined;
        const celsius = toCelsius(target);
        if (celsius === null) return invalidValue('targetSetpoint missing');
        return ok({ [features.setpoint.property]: celsius });
      }
      if (name === 'SetThermostatMode') {
        if (!features.thermostatMode) return unsupported(namespace);
        const wanted = String(payload.thermostatMode?.value ?? '');
        const match = (features.thermostatMode.values ?? []).find(
          (v) => String(v).toUpperCase() === wanted.toUpperCase(),
        );
        if (match === undefined) {
          return invalidValue(`Unsupported thermostat mode: ${wanted}`);
        }
        return ok({ [features.thermostatMode.property]: match });
      }
      return unsupported(`${namespace}.${name}`);
    }

    case 'Alexa.LockController': {
      if (!features.lock) return unsupported(namespace);
      const value =
        name === 'Lock' ? features.lock.valueOn : features.lock.valueOff;
      if (value === undefined) return unsupported(namespace);
      return ok({ [features.lock.property]: value });
    }

    default:
      return unsupported(namespace);
  }
}

function toCelsius(
  target: { value: number; scale: string } | undefined,
): number | null {
  const value = asNumber(target?.value);
  if (value === null) return null;
  switch (target?.scale) {
    case 'FAHRENHEIT':
      return Math.round(((value - 32) * 5) / 9 * 10) / 10;
    case 'KELVIN':
      return Math.round((value - 273.15) * 10) / 10;
    default:
      return value;
  }
}

function ok(command: Record<string, unknown>): DirectiveCommandResult {
  return { ok: true, command };
}

function unsupported(what: string): DirectiveCommandResult {
  return {
    ok: false,
    errorType: 'INVALID_DIRECTIVE',
    message: `Directive not supported by this endpoint: ${what}`,
  };
}

function invalidValue(message: string): DirectiveCommandResult {
  return { ok: false, errorType: 'INVALID_VALUE', message };
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
