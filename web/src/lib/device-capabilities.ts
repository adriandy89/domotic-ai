// Frontend "device view-model": the single place that knows how each protocol exposes
// its capabilities. Mirrors the backend protocol-adapter pattern so the rest of the UI
// (cards, rules, schedules, reports, dashboard) can stay protocol-agnostic and never read
// `attributes.definition.exposes` (zigbee) or `attributes.config` (HA-discovery) directly.
//
// Zigbee passes through UNCHANGED (its native zigbee2mqtt exposes, preserving
// color/composite/climate richness). HA-discovery (wifi/zwave/ble) is derived from its
// `config.cmps` into the same `DeviceExpose` shape the `Feature` renderer already consumes.

import {
  Cpu,
  DoorOpen,
  Droplets,
  Eye,
  Flame,
  Gauge,
  Lightbulb,
  Thermometer,
  Volume2,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type {
  Device,
  DeviceExpose,
  HaRawComponent,
  HaRawConfig,
} from '../store/useDevicesStore';
import type { Protocol } from './integration-templates';

/** zigbee2mqtt access bitmask, reused as the canonical access model for all protocols. */
export const FeatureAccessMode = {
  STATE: 1, // readable (published)
  SET: 2, // writable (command)
  GET: 4, // can be requested
} as const;

/** Metadata keys that are not user-facing measurements (mirrors backend HA_META_KEYS). */
const META_KEYS = new Set(['device', 'ts', 'timestamp']);

/** HA state_class values whose state is numeric (HA recorder statistics set). */
const NUMERIC_STATE_CLASSES = new Set([
  'measurement',
  'measurement_angle',
  'total',
  'total_increasing',
]);

/** Component-level abbreviation → full key (subset; backend uses the same map). */
const ABBR: Record<string, string> = {
  p: 'platform',
  dev_cla: 'device_class',
  unit_of_meas: 'unit_of_measurement',
  stat_cla: 'state_class',
  val_tpl: 'value_template',
  cmd_t: 'command_topic',
  uniq_id: 'unique_id',
  pl_on: 'payload_on',
  pl_off: 'payload_off',
  ops: 'options',
};

export function isHaDevice(device: Device): boolean {
  return device.attributes?.source === 'hadiscovery';
}

/** Resolve the protocol, preferring the explicit field, then the HA attributes, else zigbee. */
export function getDeviceProtocol(device: Device): Protocol {
  if (device.protocol) return device.protocol;
  if (isHaDevice(device)) {
    return (device.attributes?.protocol as Protocol) ?? 'wifi';
  }
  return 'zigbee';
}

function expand(comp: HaRawComponent): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(comp)) out[ABBR[k] ?? k] = v;
  return out;
}

function prettify(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Map one HA-discovery component to a `DeviceExpose`. */
function haComponentToExpose(
  objectId: string,
  rawComp: HaRawComponent,
): DeviceExpose {
  const cp = expand(rawComp);
  const platform = (cp.platform as string) ?? 'sensor';
  const unit = cp.unit_of_measurement as string | undefined;
  const deviceClass = cp.device_class as string | undefined;
  const stateClass = cp.state_class as string | undefined;
  const writable =
    cp.command_topic !== undefined ||
    ['switch', 'light', 'fan', 'lock', 'number', 'select', 'cover'].includes(
      platform,
    );
  const access = writable
    ? FeatureAccessMode.STATE | FeatureAccessMode.SET
    : FeatureAccessMode.STATE;

  // Diagnostics (timestamp/signal) are hidden from the main properties list, like
  // zigbee hides `linkquality` — they stay in the config but render in the footer.
  const isDiagnostic =
    META_KEYS.has(objectId) ||
    deviceClass === 'timestamp' ||
    deviceClass === 'signal_strength';

  const base: DeviceExpose = {
    name: objectId,
    property: objectId,
    label: (cp.name as string) ?? prettify(objectId),
    type: 'text',
    access,
    unit,
    ...(stateClass && { state_class: stateClass }),
    ...(deviceClass && { device_class: deviceClass }),
    ...(isDiagnostic && { category: 'diagnostic' }),
  };

  switch (platform) {
    case 'binary_sensor':
      return {
        ...base,
        type: 'binary',
        access: FeatureAccessMode.STATE,
        value_on: (cp.payload_on as string | boolean) ?? true,
        value_off: (cp.payload_off as string | boolean) ?? false,
      };
    case 'switch':
    case 'light':
    case 'fan':
      return {
        ...base,
        type: 'binary',
        value_on: (cp.payload_on as string | boolean) ?? 'ON',
        value_off: (cp.payload_off as string | boolean) ?? 'OFF',
      };
    case 'lock':
      return {
        ...base,
        type: 'binary',
        value_on: (cp.payload_on as string | boolean) ?? 'LOCK',
        value_off: (cp.payload_off as string | boolean) ?? 'UNLOCK',
      };
    case 'number':
      return {
        ...base,
        type: 'numeric',
        value_min: cp.min as number | undefined,
        value_max: cp.max as number | undefined,
        value_step: cp.step as number | undefined,
      };
    case 'select':
      return {
        ...base,
        type: 'enum',
        values: (cp.options as string[] | undefined) ?? [],
      };
    case 'sensor':
    default:
      // A numeric state_class (HA recorder semantics) or a unit → numeric
      // (shows "11.7ppm"). Otherwise the value may be a number
      // (air_quality_raw) or a string (sound_class), so use the generic
      // `value` display which renders either faithfully.
      return {
        ...base,
        type:
          unit || (stateClass && NUMERIC_STATE_CLASSES.has(stateClass))
            ? 'numeric'
            : 'value',
      };
  }
}

/** Derive `DeviceExpose[]` from an HA-discovery raw config. */
function deriveHaExposes(config: HaRawConfig | undefined): DeviceExpose[] {
  if (!config?.cmps) return [];
  return Object.entries(config.cmps)
    .filter(([, c]) => c && typeof c === 'object' && Object.keys(c).length > 0)
    .map(([objectId, comp]) => haComponentToExpose(objectId, comp));
}

/**
 * The canonical capability list for a device, regardless of protocol. Zigbee returns its
 * native exposes unchanged; HA-discovery is derived from `config.cmps`.
 */
export function getDeviceExposes(device: Device): DeviceExpose[] {
  if (isHaDevice(device)) {
    return deriveHaExposes(device.attributes?.config);
  }
  return device.attributes?.definition?.exposes ?? [];
}

/** Flatten composite exposes (zigbee nests sub-features under `features`). */
export function flattenExposes(exposes: DeviceExpose[]): DeviceExpose[] {
  const out: DeviceExpose[] = [];
  for (const e of exposes) {
    if (e.features && e.features.length > 0) out.push(...flattenExposes(e.features));
    else out.push(e);
  }
  return out;
}

/** Writable exposes (access has the SET bit) — for rules/schedules action pickers. */
export function getPublishableExposes(device: Device): DeviceExpose[] {
  return flattenExposes(getDeviceExposes(device)).filter(
    (e) => (e.access & FeatureAccessMode.SET) !== 0,
  );
}

/** Readable exposes (access has the STATE bit) — for conditions/reports. */
export function getReadableExposes(device: Device): DeviceExpose[] {
  return flattenExposes(getDeviceExposes(device)).filter(
    (e) => (e.access & FeatureAccessMode.STATE) !== 0,
  );
}

/** True if the device exposes any property/name in `names`. */
export function hasExpose(device: Device, names: string[]): boolean {
  const wanted = new Set(names);
  return flattenExposes(getDeviceExposes(device)).some(
    (e) => wanted.has(e.property) || wanted.has(e.name),
  );
}

// ── Presentation helpers ──────────────────────────────────────────────────────

/** Pick a card icon from the device's exposes/property names (protocol-agnostic). */
export function getDeviceIcon(device: Device): LucideIcon {
  const names = new Set(
    flattenExposes(getDeviceExposes(device)).flatMap((e) => [e.name, e.property]),
  );
  const has = (...keys: string[]) => keys.some((k) => names.has(k));

  if (has('state', 'switch')) return Lightbulb;
  if (has('temperature')) return Thermometer;
  if (has('humidity', 'water_leak')) return Droplets;
  if (has('contact')) return DoorOpen;
  if (has('occupancy', 'presence')) return Eye;
  if (has('smoke')) return Flame;
  if (has('alarm') || [...names].some((n) => n?.includes('noise') || n?.includes('sound')))
    return Volume2;
  if ([...names].some((n) => n?.includes('co_ppm') || n?.includes('gas') || n?.includes('air_quality')))
    return Wind;
  if (has('power', 'energy')) return Zap;
  if ([...names].some((n) => n?.endsWith('_ppm') || n?.includes('pressure')))
    return Gauge;
  return Cpu;
}

/** Vendor/model/description, protocol-aware. */
export function getDeviceMeta(device: Device): {
  vendor: string;
  model: string;
  description: string | null;
} {
  if (isHaDevice(device)) {
    const dev = device.attributes?.config?.dev ?? {};
    return {
      vendor: (dev.mf as string) || 'Unknown',
      model: (dev.mdl as string) || device.model,
      description: device.description,
    };
  }
  return {
    vendor: device.attributes?.definition?.vendor || 'Unknown',
    model: device.attributes?.definition?.model || device.model,
    description: device.attributes?.definition?.description || device.description,
  };
}

export interface DeviceFooterMeta {
  /** Online state when known (HA availability / `Device.online`); undefined = unknown. */
  online?: boolean;
  /** Link/signal strength label + raw value for the badge. */
  signal: { label: string; color: string; value: number | string };
  battery?: number;
  /** Whether to show the battery badge. */
  hasBattery: boolean;
  /** Whether the device is mains-powered (AC badge). */
  isMains: boolean;
  typeLabel: string;
}

function lqiToSignal(lqi?: number): DeviceFooterMeta['signal'] {
  if (lqi === undefined)
    return { label: 'N/A', color: 'text-muted-foreground', value: 'N/A' };
  if (lqi >= 150) return { label: 'Excellent', color: 'text-emerald-500', value: lqi };
  if (lqi >= 80) return { label: 'Good', color: 'text-cyan-500', value: lqi };
  if (lqi >= 40) return { label: 'Fair', color: 'text-amber-500', value: lqi };
  return { label: 'Poor', color: 'text-red-500', value: lqi };
}

function rssiToSignal(rssi?: number): DeviceFooterMeta['signal'] {
  if (rssi === undefined)
    return { label: 'N/A', color: 'text-muted-foreground', value: 'N/A' };
  // WiFi RSSI (dBm): closer to 0 is better.
  if (rssi >= -60) return { label: 'Excellent', color: 'text-emerald-500', value: `${rssi}dBm` };
  if (rssi >= -70) return { label: 'Good', color: 'text-cyan-500', value: `${rssi}dBm` };
  if (rssi >= -80) return { label: 'Fair', color: 'text-amber-500', value: `${rssi}dBm` };
  return { label: 'Poor', color: 'text-red-500', value: `${rssi}dBm` };
}

/** Normalized footer metadata for the card, protocol-aware. */
export function getDeviceFooterMeta(
  device: Device,
  data: Record<string, unknown>,
): DeviceFooterMeta {
  const battery = data.battery as number | undefined;
  if (isHaDevice(device)) {
    return {
      online: device.online,
      signal: rssiToSignal(data.wifi_rssi as number | undefined),
      battery,
      hasBattery: battery !== undefined,
      isMains: false,
      typeLabel: 'Device',
    };
  }
  const powerSource = (device.attributes?.power_source || '').toLowerCase();
  return {
    online: device.online,
    signal: lqiToSignal(data.linkquality as number | undefined),
    battery,
    hasBattery: powerSource.includes('battery'),
    isMains: powerSource.includes('mains'),
    typeLabel: device.attributes?.type || 'Device',
  };
}
