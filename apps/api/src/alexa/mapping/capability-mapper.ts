import type { DeviceAction, DeviceReadableAttribute } from '@app/models';
import type { AlexaCapability } from './alexa.types';

/**
 * Pure projection of the platform's protocol-agnostic capability model onto
 * Alexa Smart Home interfaces. Kept standalone so the future proactive
 * ChangeReporter (v2) can reuse it unchanged.
 */

/** The platform features backing each announced Alexa interface. */
export interface MappedFeatures {
  /** Primary on/off action (`state`/`switch`, or media `power`). */
  onOff?: DeviceAction;
  brightness?: DeviceAction;
  color?: DeviceAction;
  colorTemp?: DeviceAction;
  thermostatMode?: DeviceAction;
  setpoint?: DeviceAction;
  lock?: DeviceAction;
  temperature?: DeviceReadableAttribute;
  contact?: DeviceReadableAttribute;
  motion?: DeviceReadableAttribute;
}

export interface CapabilityMapping {
  displayCategories: string[];
  capabilities: AlexaCapability[];
  features: MappedFeatures;
}

const ALEXA_BASE: AlexaCapability = {
  type: 'AlexaInterface',
  interface: 'Alexa',
  version: '3',
};

/** Zigbee `system_mode` values ↔ Alexa thermostat modes (upper-cased match). */
export const THERMOSTAT_MODES = ['HEAT', 'COOL', 'AUTO', 'OFF', 'ECO'];

/**
 * Maps a device's actions/readable attributes to its Alexa endpoint shape.
 * Returns null when nothing is voice-controllable or reportable — such
 * devices are skipped at discovery.
 */
export function mapCapabilities(
  actions: DeviceAction[],
  readables: DeviceReadableAttribute[],
): CapabilityMapping | null {
  const features = detectFeatures(actions, readables);
  const capabilities: AlexaCapability[] = [];
  const categories: string[] = [];

  if (features.onOff) {
    capabilities.push(iface('Alexa.PowerController', ['powerState']));
  }
  if (features.brightness) {
    capabilities.push(iface('Alexa.BrightnessController', ['brightness']));
  }
  if (features.color) {
    capabilities.push(iface('Alexa.ColorController', ['color']));
  }
  if (features.colorTemp) {
    capabilities.push(
      iface('Alexa.ColorTemperatureController', ['colorTemperatureInKelvin']),
    );
  }
  if (features.thermostatMode && features.setpoint) {
    const supported = supportedThermostatModes(features.thermostatMode);
    capabilities.push({
      ...iface('Alexa.ThermostatController', [
        'targetSetpoint',
        'thermostatMode',
      ]),
      configuration: {
        supportedModes: supported,
        supportsScheduling: false,
      },
    });
  }
  if (features.lock) {
    capabilities.push(iface('Alexa.LockController', ['lockState']));
  }
  if (features.temperature) {
    capabilities.push(iface('Alexa.TemperatureSensor', ['temperature']));
  }
  if (features.contact) {
    capabilities.push(iface('Alexa.ContactSensor', ['detectionState']));
  }
  if (features.motion) {
    capabilities.push(iface('Alexa.MotionSensor', ['detectionState']));
  }

  if (capabilities.length === 0) return null;

  // Display categories, mirroring the web app's icon inference
  // (web/src/lib/device-capabilities.ts): most specific first.
  if (features.lock) {
    categories.push('SMARTLOCK');
  } else if (features.thermostatMode && features.setpoint) {
    categories.push('THERMOSTAT');
  } else if (features.onOff && isMedia(features, actions)) {
    categories.push('TV');
  } else if (
    features.onOff &&
    (features.brightness || features.color || features.colorTemp)
  ) {
    categories.push('LIGHT');
  } else if (features.onOff && hasEnergyReadable(readables)) {
    categories.push('SMARTPLUG');
  } else if (features.onOff) {
    categories.push('SWITCH');
  }
  if (features.contact) categories.push('CONTACT_SENSOR');
  if (features.motion) categories.push('MOTION_SENSOR');
  if (features.temperature) categories.push('TEMPERATURE_SENSOR');
  if (categories.length === 0) categories.push('OTHER');

  capabilities.push(endpointHealth(), ALEXA_BASE);

  return { displayCategories: dedupe(categories), capabilities, features };
}

export function supportedThermostatModes(modeAction: DeviceAction): string[] {
  const values = (modeAction.values ?? []).map((v) => String(v).toUpperCase());
  return THERMOSTAT_MODES.filter((m) => values.includes(m));
}

/** SceneController endpoint shape for a learned IR command. */
export function sceneCapabilities(): AlexaCapability[] {
  return [
    {
      type: 'AlexaInterface',
      interface: 'Alexa.SceneController',
      version: '3',
      supportsDeactivation: false,
    },
    ALEXA_BASE,
  ];
}

function detectFeatures(
  actions: DeviceAction[],
  readables: DeviceReadableAttribute[],
): MappedFeatures {
  const features: MappedFeatures = {};

  for (const action of actions) {
    if (action.type === 'binary' && isLockAction(action)) {
      features.lock ??= action;
      continue;
    }
    if (
      action.type === 'binary' &&
      ['state', 'switch', 'power'].includes(action.property)
    ) {
      // Prefer `state`/`switch` over media `power` when both exist.
      if (!features.onOff || action.property !== 'power') {
        features.onOff = action;
      }
      continue;
    }
    if (action.type === 'numeric' && action.property === 'brightness') {
      features.brightness = action;
    } else if (action.type === 'numeric' && action.property === 'color_temp') {
      features.colorTemp = action;
    } else if (
      action.property === 'color' &&
      (action.type === 'color' || action.colorFormats?.length)
    ) {
      features.color = action;
    } else if (action.type === 'enum' && action.property === 'system_mode') {
      features.thermostatMode = action;
    } else if (action.type === 'numeric' && isSetpointAction(action)) {
      // Prefer the heating setpoint when a device exposes several.
      if (!features.setpoint || action.property.includes('heating')) {
        features.setpoint = action;
      }
    }
  }

  for (const attr of readables) {
    if (attr.property === 'temperature' && attr.type === 'numeric') {
      features.temperature = attr;
    } else if (attr.property === 'contact' && attr.type === 'binary') {
      features.contact = attr;
    } else if (
      ['occupancy', 'presence'].includes(attr.property) &&
      attr.type === 'binary'
    ) {
      features.motion ??= attr;
    }
  }

  return features;
}

export function isLockAction(action: DeviceAction): boolean {
  return (
    String(action.valueOn).toUpperCase() === 'LOCK' &&
    String(action.valueOff).toUpperCase() === 'UNLOCK'
  );
}

function isSetpointAction(action: DeviceAction): boolean {
  return (
    action.property.includes('setpoint') ||
    action.property === 'target_temperature'
  );
}

/** Media device rule mirrored from the web's isMediaDevice(). */
function isMedia(features: MappedFeatures, actions: DeviceAction[]): boolean {
  if (features.onOff?.property !== 'power') return false;
  const byProp = new Map(actions.map((a) => [a.property, a]));
  return (
    byProp.get('volume')?.type === 'numeric' &&
    (byProp.get('input')?.type === 'enum' || byProp.get('app')?.type === 'enum')
  );
}

function hasEnergyReadable(readables: DeviceReadableAttribute[]): boolean {
  return readables.some(
    (r) => ['power', 'energy'].includes(r.property) && r.type === 'numeric',
  );
}

function iface(name: string, properties: string[]): AlexaCapability {
  return {
    type: 'AlexaInterface',
    interface: name,
    version: '3',
    properties: {
      supported: properties.map((p) => ({ name: p })),
      proactivelyReported: false, // v2 seam: flip when the ChangeReporter lands
      retrievable: true,
    },
  };
}

function endpointHealth(): AlexaCapability {
  return iface('Alexa.EndpointHealth', ['connectivity']);
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
