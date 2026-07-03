/**
 * Home Assistant MQTT Discovery payload model.
 * Reference: https://www.home-assistant.io/integrations/mqtt/#mqtt-discovery
 *
 * We persist the discovery config **raw and complete** in `Device.attributes` (mirroring
 * how the Zigbee adapter stores the bridge object verbatim) and derive capabilities at
 * read time — see {@link toCanonicalConfig} / {@link deriveEntities}. Nothing is dropped.
 *
 * Two discovery shapes are supported:
 *  - device-based (HA 2024.11+): `<prefix>/device/<object_id>/config`, one config bundling
 *    many components under `cmps`, sharing `~`/`stat_t`/`availability`.
 *  - per-entity (classic): `<prefix>/<component>/[<node_id>/]<object_id>/config`, one entity
 *    per message (zwave-js-ui, theengs/gateway, classic ESPHome). We normalize these into
 *    the same device-based shape (each entity wrapped under `cmps`) without losing fields.
 * Payloads may use full keys (`state_topic`) or abbreviated keys (`stat_t`), and a `~` base
 * topic that abbreviates topic values.
 */

/** Components we map to controllable actions or readable attributes. */
export type HaComponent =
  | 'switch'
  | 'light'
  | 'fan'
  | 'lock'
  | 'cover'
  | 'number'
  | 'select'
  | 'sensor'
  | 'binary_sensor';

/**
 * The canonical raw discovery config we persist, kept faithful to the published payload
 * (abbreviations and `~` preserved). `cmps` is the components map; every other field is
 * carried verbatim so the stored config is complete and self-describing.
 */
export interface HaRawConfig {
  /** Base topic abbreviation, e.g. `home/id/{uuid}/wifi/{deviceId}`. */
  '~'?: string;
  /** Device block (`ids`/`name`/`mdl`/`mf`/`sw`/`hw`…), abbreviated keys preserved. */
  dev?: Record<string, unknown>;
  /** Origin block (`name`/`sw`/`url`). */
  o?: Record<string, unknown>;
  /** Availability declaration (array form or single-topic form). */
  availability?: unknown;
  availability_topic?: string;
  payload_available?: string;
  payload_not_available?: string;
  /** Shared state topic for the device-based bundle (often `~/state`). */
  stat_t?: string;
  /** Components keyed by object id; each value is the raw component object. */
  cmps: Record<string, Record<string, unknown>>;
  /** Any other top-level discovery keys, carried verbatim. */
  [key: string]: unknown;
}

/** The persisted `Device.attributes` for an HA-Discovery device. */
export interface HaDeviceAttributes {
  source: 'hadiscovery';
  /** Resolved strictly from the topic route; absent when it couldn't be inferred. */
  protocol?: string;
  /** The complete, raw discovery config. Capabilities are derived from this at read time. */
  config: HaRawConfig;
}

/**
 * A single HA entity, **derived** from {@link HaRawConfig} at read time (abbreviations
 * expanded, `~` resolved). Not persisted.
 */
export interface HaEntity {
  component: string;
  /** Property key used in our canonical command/state model (unique within a device). */
  property: string;
  uniqueId: string;
  name?: string;
  deviceClass?: string;
  unit?: string;
  stateTopic?: string;
  commandTopic?: string;
  payloadOn?: string | number | boolean;
  payloadOff?: string | number | boolean;
  brightnessCommandTopic?: string;
  brightnessStateTopic?: string;
  brightnessScale?: number;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  /** HA `state_class` (e.g. 'measurement'); carried for downstream consumers. */
  stateClass?: string;
  /** Raw HA value_template (incoming state decoding), when declared. */
  valueTemplate?: string;
  /** Raw HA command_template (outgoing command encoding), when declared. */
  commandTemplate?: string;
  /** Derived: a value_template or command_template is present. */
  hasTemplate?: boolean;
}

/**
 * Availability contract, **derived** from the config's `availability`/`availability_topic`
 * block at read time; consumed by mqtt-core to flip the device's online state.
 */
export interface HaAvailability {
  /** Resolved availability topic (`~` expanded). */
  topic: string;
  /** value_json field when the payload is JSON (e.g. 'state' for `{"state":"online"}`). */
  field?: string;
  /** Payload (or extracted field) that means online. Default 'online'. */
  payloadOnline: string;
  /** Payload (or extracted field) that means offline. Default 'offline'. */
  payloadOffline: string;
}

/** Input mqtt-core hands to the adapter for one discovery message. */
export interface HaDiscoveryInput {
  /** Topic segments after `home/id/{uuid}/discovery/`, e.g. ['device','plug1','config']. */
  topicParts: string[];
  /** Parsed JSON payload (empty object for a cleared/retained-null message). */
  payload: Record<string, unknown>;
}
