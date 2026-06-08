import { HaDiscoveryInput, HaEntity } from './ha-config.types';

/**
 * Home Assistant MQTT Discovery abbreviated → full key map (subset we consume).
 * Reference: https://www.home-assistant.io/integrations/mqtt/#discovery-payload
 */
const ABBREVIATIONS: Record<string, string> = {
  stat_t: 'state_topic',
  cmd_t: 'command_topic',
  pl_on: 'payload_on',
  pl_off: 'payload_off',
  bri_cmd_t: 'brightness_command_topic',
  bri_stat_t: 'brightness_state_topic',
  bri_scl: 'brightness_scale',
  uniq_id: 'unique_id',
  dev_cla: 'device_class',
  unit_of_meas: 'unit_of_measurement',
  val_tpl: 'value_template',
  cmd_tpl: 'command_template',
  ops: 'options',
  dev: 'device',
};

const DEVICE_ABBREVIATIONS: Record<string, string> = {
  ids: 'identifiers',
  name: 'name',
  mdl: 'model',
  mf: 'manufacturer',
};

function expand(
  payload: Record<string, unknown>,
  map: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    out[map[k] ?? k] = v;
  }
  return out;
}

function sanitizeProperty(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function firstIdentifier(device: unknown): string | undefined {
  if (!device || typeof device !== 'object') return undefined;
  const ids = (device as Record<string, unknown>).identifiers;
  if (typeof ids === 'string') return ids;
  if (Array.isArray(ids) && ids.length > 0) return String(ids[0]);
  return undefined;
}

export interface ParsedHaEntity {
  /** Stable key of the physical device this entity belongs to. */
  deviceIdentifier: string;
  deviceMeta: { name?: string; model?: string; manufacturer?: string };
  entity: HaEntity;
}

/**
 * Parse one HA discovery message into a device identifier + a normalized entity.
 * Returns `null` when the payload is empty (cleared entity) or lacks the minimum
 * fields (component / unique_id / topics).
 */
export function parseHaEntity(input: HaDiscoveryInput): ParsedHaEntity | null {
  const { topicParts, payload } = input;
  if (!payload || Object.keys(payload).length === 0) return null;

  // topicParts: [<component>, (<node_id>)?, <object_id>, 'config']
  if (topicParts.length < 3) return null;
  const component = topicParts[0];
  const objectId = topicParts[topicParts.length - 2];

  const p = expand(payload, ABBREVIATIONS);
  const device = p.device
    ? expand(p.device as Record<string, unknown>, DEVICE_ABBREVIATIONS)
    : undefined;

  const uniqueId =
    (typeof p.unique_id === 'string' && p.unique_id) || objectId;
  const deviceIdentifier =
    firstIdentifier(device) ?? (uniqueId as string);

  const hasTemplate =
    p.value_template !== undefined || p.command_template !== undefined;

  const entity: HaEntity = {
    component,
    property: sanitizeProperty(objectId),
    uniqueId,
    name: typeof p.name === 'string' ? p.name : undefined,
    deviceClass:
      typeof p.device_class === 'string' ? p.device_class : undefined,
    unit:
      typeof p.unit_of_measurement === 'string'
        ? p.unit_of_measurement
        : undefined,
    stateTopic: typeof p.state_topic === 'string' ? p.state_topic : undefined,
    commandTopic:
      typeof p.command_topic === 'string' ? p.command_topic : undefined,
    payloadOn: p.payload_on as HaEntity['payloadOn'],
    payloadOff: p.payload_off as HaEntity['payloadOff'],
    brightnessCommandTopic:
      typeof p.brightness_command_topic === 'string'
        ? p.brightness_command_topic
        : undefined,
    brightnessStateTopic:
      typeof p.brightness_state_topic === 'string'
        ? p.brightness_state_topic
        : undefined,
    brightnessScale:
      typeof p.brightness_scale === 'number' ? p.brightness_scale : undefined,
    min: typeof p.min === 'number' ? p.min : undefined,
    max: typeof p.max === 'number' ? p.max : undefined,
    step: typeof p.step === 'number' ? p.step : undefined,
    options: Array.isArray(p.options)
      ? (p.options as unknown[]).map(String)
      : undefined,
    hasTemplate: hasTemplate || undefined,
  };

  return {
    deviceIdentifier,
    deviceMeta: {
      name: device?.name as string | undefined,
      model: device?.model as string | undefined,
      manufacturer: device?.manufacturer as string | undefined,
    },
    entity,
  };
}
