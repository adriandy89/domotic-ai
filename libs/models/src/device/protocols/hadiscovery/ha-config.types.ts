/**
 * Home Assistant MQTT Discovery payload model (subset we consume).
 * Reference: https://www.home-assistant.io/integrations/mqtt/#mqtt-discovery
 *
 * Discovery topic: <discovery_prefix>/<component>/[<node_id>/]<object_id>/config
 * Payloads may use full keys (`state_topic`) or abbreviated keys (`stat_t`).
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

/** A single discovered HA entity, normalized to full keys. */
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
  /** Present when the entity needs templating we don't evaluate → treated read-only. */
  hasTemplate?: boolean;
}

/** The persisted `Device.attributes` for an HA-Discovery device. */
export interface HaDeviceAttributes {
  source: 'hadiscovery';
  /** Resolved strictly from the topic route; absent when it couldn't be inferred. */
  protocol?: string;
  device: {
    identifiers: string;
    name?: string;
    model?: string;
    manufacturer?: string;
  };
  /** Entities keyed by their HA `unique_id`. */
  entities: Record<string, HaEntity>;
}

/** Input mqtt-core hands to the adapter for one discovery message. */
export interface HaDiscoveryInput {
  /** Topic segments after `home/id/{uuid}/discovery/`, e.g. ['light','plug1','config']. */
  topicParts: string[];
  /** Parsed JSON payload (empty object for a cleared/retained-null message). */
  payload: Record<string, unknown>;
}
