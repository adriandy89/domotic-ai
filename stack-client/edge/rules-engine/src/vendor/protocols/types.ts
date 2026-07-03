/**
 * Protocol-agnostic device capability types.
 *
 * These are the canonical types every {@link ProtocolAdapter} speaks, regardless
 * of the underlying transport (Zigbee exposes, Home Assistant MQTT discovery, ...).
 * Rules, schedules, the AI tools and the MCP server all operate on these — so a new
 * protocol only has to translate its native format into them.
 */

/** Supported device protocols. Persisted on `Device.protocol`. */
export enum DeviceProtocol {
  ZIGBEE = 'zigbee',
  ZWAVE = 'zwave',
  WIFI = 'wifi',
  BLE = 'ble',
}

/**
 * A normalized, write-capable action a device exposes.
 * For Zigbee, `color_xy`/`color_hs`/`color_rgb` composites collapse into a single
 * `color` action (see `colorFormats`).
 */
export interface DeviceAction {
  property: string;
  type: string;
  label?: string;
  description?: string;
  unit?: string;
  valueOn?: boolean | string | number;
  valueOff?: boolean | string | number;
  valueToggle?: boolean | string | number;
  valueMin?: number;
  valueMax?: number;
  valueStep?: number;
  values?: (string | number)[];
  /** Color-only: which composite formats this device accepts ('xy' | 'hs' | 'rgb'). */
  colorFormats?: ('xy' | 'hs' | 'rgb')[];
  /**
   * Composite-only: the writable sub-actions of a `composite` expose (e.g. the
   * siren's `warning`). The command must be sent as a nested object under
   * `property`, e.g. `{ warning: { mode, strobe, duration } }`.
   */
  features?: DeviceAction[];
}

/**
 * A normalized, readable (published) attribute a device reports.
 * Used to validate Rule conditions / notification-event attributes.
 */
export interface DeviceReadableAttribute {
  property: string;
  type: string;
  unit?: string;
  values?: (string | number)[];
  /**
   * HA `state_class` when the protocol declares it ('measurement', 'total',
   * 'total_increasing', …) — marks the attribute as a numeric statistic source.
   */
  stateClass?: string;
  /** HA `device_class` when declared ('temperature', 'sound_pressure', …). */
  deviceClass?: string;
}

export interface NormalizeWarning {
  property: string;
  message: string;
}

export interface NormalizeResult {
  command: Record<string, unknown>;
  warnings: NormalizeWarning[];
}

export interface ValidationError {
  property: string;
  code:
    | 'UNKNOWN_PROPERTY'
    | 'INVALID_TYPE'
    | 'OUT_OF_RANGE'
    | 'INVALID_ENUM'
    | 'INVALID_BINARY'
    | 'INVALID_COLOR'
    | 'INVALID_COMPOSITE'
    | 'INVALID_SCHEDULE';
  message: string;
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: ValidationError[] };

/**
 * The outcome of parsing a single entry from a protocol's discovery feed.
 * `attributes` is the protocol-native descriptor persisted to `Device.attributes`
 * and later handed back to the same adapter to derive actions/readable attributes.
 */
export interface DiscoveredDevice {
  uniqueId: string;
  name: string;
  model?: string;
  category?: string;
  attributes: unknown;
  /**
   * Protocol the adapter inferred for this device, when it can't be read from the
   * discovery topic alone (HA-Discovery shares one prefix across zwave/wifi/ble and
   * infers the protocol from the entity's state/command topics). When omitted,
   * mqtt-core falls back to the protocol segment of the topic.
   */
  protocol?: string;
}

/** Minimal device reference an adapter needs to address a command. */
export interface DeviceRef {
  homeUniqueId: string;
  deviceUniqueId: string;
  protocol: DeviceProtocol;
  attributes: unknown;
}

/** An MQTT message to publish (the default transport). */
export interface CommandMessage {
  topic: string;
  payload: string;
}
