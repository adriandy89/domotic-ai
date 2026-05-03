import { DeviceAction, DeviceExpose } from './exposes.types';
import { getAvailableActions } from './parse-exposes';

/**
 * Convenience: validate against raw exposes by parsing actions internally.
 */
export function validateCommandAgainstExposes(
  command: Record<string, unknown>,
  exposes: DeviceExpose[],
): ValidationResult {
  return validateCommand(command, getAvailableActions(exposes));
}

export interface ValidationError {
  property: string;
  code:
    | 'UNKNOWN_PROPERTY'
    | 'INVALID_TYPE'
    | 'OUT_OF_RANGE'
    | 'INVALID_ENUM'
    | 'INVALID_BINARY'
    | 'INVALID_COLOR';
  message: string;
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: ValidationError[] };

/**
 * Properties zigbee2mqtt accepts but that don't appear in `exposes`.
 * Ranges follow the z2m docs / common firmware conventions.
 *  - transition: seconds, 0..30 typical
 *  - effect: free-form string (device-specific), accepted as-is
 *  - read / write / state_*: meta-controls, accepted as-is
 */
const SPECIAL_PROPERTIES: Record<
  string,
  (value: unknown) => ValidationError | null
> = {
  transition: (value) => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return {
        property: 'transition',
        code: 'INVALID_TYPE',
        message: 'transition must be a number (seconds)',
      };
    }
    if (value < 0 || value > 600) {
      return {
        property: 'transition',
        code: 'OUT_OF_RANGE',
        message: 'transition out of range (0-600s)',
      };
    }
    return null;
  },
  effect: () => null,
  read: () => null,
  write: () => null,
};

const SPECIAL_PROPERTY_PREFIXES = ['state_'];

/**
 * Validates a command payload against the device's writable actions.
 * Pure: no I/O, no DB.
 */
export function validateCommand(
  command: Record<string, unknown>,
  actions: DeviceAction[],
): ValidationResult {
  const errors: ValidationError[] = [];

  for (const [property, value] of Object.entries(command)) {
    const action = actions.find((a) => a.property === property);

    if (!action) {
      const special = SPECIAL_PROPERTIES[property];
      if (special) {
        const err = special(value);
        if (err) errors.push(err);
        continue;
      }
      if (SPECIAL_PROPERTY_PREFIXES.some((p) => property.startsWith(p)))
        continue;
      errors.push({
        property,
        code: 'UNKNOWN_PROPERTY',
        message: `Property "${property}" is not writable on this device.`,
      });
      continue;
    }

    const err = validateValue(action, value);
    if (err) errors.push(err);
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

function validateValue(
  action: DeviceAction,
  value: unknown,
): ValidationError | null {
  switch (action.type) {
    case 'binary':
      return validateBinary(action, value);
    case 'numeric':
      return validateNumeric(action, value);
    case 'enum':
      return validateEnum(action, value);
    case 'color':
      return validateColor(action, value);
    default:
      return null;
  }
}

function validateBinary(
  action: DeviceAction,
  value: unknown,
): ValidationError | null {
  const allowed: unknown[] = [];
  if (action.valueOn !== undefined) allowed.push(action.valueOn);
  if (action.valueOff !== undefined) allowed.push(action.valueOff);
  if (action.valueToggle !== undefined) allowed.push(action.valueToggle);
  if (allowed.length === 0) return null;
  if (!allowed.some((a) => a === value)) {
    return {
      property: action.property,
      code: 'INVALID_BINARY',
      message: `"${action.property}" must be one of: ${allowed.map((a) => JSON.stringify(a)).join(', ')}. Got ${JSON.stringify(value)}.`,
    };
  }
  return null;
}

function validateNumeric(
  action: DeviceAction,
  value: unknown,
): ValidationError | null {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return {
      property: action.property,
      code: 'INVALID_TYPE',
      message: `"${action.property}" must be a number. Got ${JSON.stringify(value)}.`,
    };
  }
  if (action.valueMin !== undefined && value < action.valueMin) {
    return {
      property: action.property,
      code: 'OUT_OF_RANGE',
      message: `"${action.property}" must be ≥ ${action.valueMin}. Got ${value}.`,
    };
  }
  if (action.valueMax !== undefined && value > action.valueMax) {
    return {
      property: action.property,
      code: 'OUT_OF_RANGE',
      message: `"${action.property}" must be ≤ ${action.valueMax}. Got ${value}.`,
    };
  }
  return null;
}

function validateEnum(
  action: DeviceAction,
  value: unknown,
): ValidationError | null {
  if (!action.values || action.values.length === 0) return null;
  if (!action.values.includes(value as string | number)) {
    return {
      property: action.property,
      code: 'INVALID_ENUM',
      message: `"${action.property}" must be one of: ${action.values.map((v) => JSON.stringify(v)).join(', ')}. Got ${JSON.stringify(value)}.`,
    };
  }
  return null;
}

function validateColor(
  action: DeviceAction,
  value: unknown,
): ValidationError | null {
  if (!value || typeof value !== 'object') {
    return {
      property: action.property,
      code: 'INVALID_COLOR',
      message:
        'color must be an object like { hex }, { x, y }, { hue, saturation } or { r, g, b }.',
    };
  }
  const v = value as Record<string, unknown>;
  const hasXY = typeof v.x === 'number' && typeof v.y === 'number';
  const hasHS = typeof v.hue === 'number' && typeof v.saturation === 'number';
  const hasRGB =
    typeof v.r === 'number' &&
    typeof v.g === 'number' &&
    typeof v.b === 'number';
  const hasHex = typeof v.hex === 'string';
  if (!hasXY && !hasHS && !hasRGB && !hasHex) {
    return {
      property: action.property,
      code: 'INVALID_COLOR',
      message:
        'color must include one of: hex, {x,y}, {hue,saturation}, {r,g,b}.',
    };
  }
  return null;
}
