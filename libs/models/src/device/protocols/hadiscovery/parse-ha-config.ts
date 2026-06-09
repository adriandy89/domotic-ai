import {
  HaAvailability,
  HaDiscoveryInput,
  HaEntity,
  HaRawConfig,
} from './ha-config.types';

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
  stat_cla: 'state_class',
  unit_of_meas: 'unit_of_measurement',
  val_tpl: 'value_template',
  cmd_tpl: 'command_template',
  ops: 'options',
  dev: 'device',
  // Availability block.
  avty: 'availability',
  avty_t: 'availability_topic',
  avty_tpl: 'availability_template',
  pl_avail: 'payload_available',
  pl_not_avail: 'payload_not_available',
};

/** Component-level abbreviations: the entity keys plus the device-based `p` (platform). */
const COMPONENT_ABBREVIATIONS: Record<string, string> = {
  ...ABBREVIATIONS,
  p: 'platform',
};

/**
 * Keys present in an aggregate JSON state payload that describe the message itself rather
 * than a readable measurement. Excluded from synthesized configs and from the derived
 * readable-attribute list (but kept in the stored raw config when discovery declares them).
 */
export const HA_META_KEYS = new Set(['device', 'ts', 'timestamp']);

/** Device-level keys lifted to the bundle root when wrapping a per-entity classic config. */
const DEVICE_LEVEL_KEYS = new Set([
  '~',
  'dev',
  'device',
  'o',
  'availability',
  'avty',
  'availability_topic',
  'avty_t',
  'payload_available',
  'pl_avail',
  'payload_not_available',
  'pl_not_avail',
]);

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
  return raw
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Resolve the HA `~` base-topic abbreviation. A topic value that is exactly `~`, starts
 * with `~/`, or ends with `/~` has the `~` replaced by `base`.
 * Reference: https://www.home-assistant.io/integrations/mqtt/#using-abbreviations-and-base-topic
 */
function resolveTopic(value: unknown, base?: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (!base) return value;
  if (value === '~') return base;
  if (value.startsWith('~/')) return base + value.slice(1);
  if (value.endsWith('/~')) return value.slice(0, -1) + base;
  return value;
}

/** Extract the first `value_json.<field>` referenced by a value_template. */
function valueJsonField(template: unknown): string | undefined {
  if (typeof template !== 'string') return undefined;
  const m = template.match(/value_json\.([a-zA-Z0-9_]+)/);
  return m ? m[1] : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function firstIdentifier(device: unknown): string | undefined {
  if (!device || typeof device !== 'object') return undefined;
  const dev = device as Record<string, unknown>;
  const ids = dev.identifiers ?? dev.ids;
  if (typeof ids === 'string') return ids;
  if (Array.isArray(ids) && ids.length > 0) return String(ids[0]);
  return undefined;
}

// ── Canonicalization (store) ─────────────────────────────────────────────────

/**
 * Turn one discovery message into the canonical raw config we persist — complete and
 * faithful to the payload. Device-based bundles are kept as-is (`cmps` normalized);
 * per-entity classic configs are wrapped so every device shares one shape.
 * Returns `null` for an empty payload (cleared/retained-null) or no usable component.
 */
export function toCanonicalConfig(input: HaDiscoveryInput): HaRawConfig | null {
  const { topicParts, payload } = input;
  if (!payload || Object.keys(payload).length === 0) return null;
  if (topicParts.length < 3) return null;

  const head = topicParts[0];
  const objectId = topicParts[topicParts.length - 2];

  const rawComponents = payload.cmps ?? payload.components;
  const isDeviceBased =
    head === 'device' ||
    (!!rawComponents &&
      typeof rawComponents === 'object' &&
      !Array.isArray(rawComponents));

  // ── Device-based: keep the bundle verbatim (normalize the components key to `cmps`).
  if (isDeviceBased) {
    if (!rawComponents || typeof rawComponents !== 'object') return null;
    const cmps = pruneEmpty(rawComponents as Record<string, unknown>);
    if (Object.keys(cmps).length === 0) return null;
    const { components: _drop, ...rest } = payload as Record<string, unknown>;
    return { ...(rest as object), cmps } as HaRawConfig;
  }

  // ── Per-entity classic: wrap the entity under `cmps`, lifting device-level keys.
  const component: Record<string, unknown> = { p: head };
  const bundle: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (DEVICE_LEVEL_KEYS.has(k)) bundle[k] = v;
    else component[k] = v;
  }
  bundle.cmps = { [objectId]: component };
  return bundle as HaRawConfig;
}

/** Drop component entries that are empty objects (a cleared/removed component). */
function pruneEmpty(
  components: Record<string, unknown>,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [k, v] of Object.entries(components)) {
    if (v && typeof v === 'object' && Object.keys(v).length > 0) {
      out[k] = v as Record<string, unknown>;
    }
  }
  return out;
}

// ── Derivation (read) ─────────────────────────────────────────────────────────

/**
 * Derive normalized entities from the stored raw config: expand abbreviations, resolve
 * `~`, inherit the bundle's shared `state_topic`/`command_topic`, and map each component
 * to an {@link HaEntity}. The `property` is the component's object id (which equals the
 * `value_json` field for our device-based firmware, and the entity object_id for classic).
 */
export function deriveEntities(config: HaRawConfig | undefined): HaEntity[] {
  if (!config || !config.cmps || typeof config.cmps !== 'object') return [];

  const base = asString(config['~']);
  const root = expand(config as Record<string, unknown>, ABBREVIATIONS);
  const deviceId = firstIdentifier(root.device) ?? '';
  const entities: HaEntity[] = [];

  for (const [objectId, rawComp] of Object.entries(config.cmps)) {
    if (!rawComp || typeof rawComp !== 'object') continue;
    const cp = expand(rawComp as Record<string, unknown>, COMPONENT_ABBREVIATIONS);
    if (Object.keys(cp).length === 0) continue;

    const component = asString(cp.platform) ?? 'sensor';
    const stateTopic = resolveTopic(cp.state_topic ?? root.state_topic, base);
    const commandTopic = resolveTopic(
      cp.command_topic ?? root.command_topic,
      base,
    );
    const hasTemplate =
      cp.value_template !== undefined || cp.command_template !== undefined;

    entities.push({
      component,
      property: sanitizeProperty(objectId),
      uniqueId: asString(cp.unique_id) ?? `${deviceId}_${objectId}`,
      name: asString(cp.name),
      deviceClass: asString(cp.device_class),
      unit: asString(cp.unit_of_measurement),
      stateClass: asString(cp.state_class),
      stateTopic,
      commandTopic,
      payloadOn: cp.payload_on as HaEntity['payloadOn'],
      payloadOff: cp.payload_off as HaEntity['payloadOff'],
      brightnessCommandTopic: resolveTopic(cp.brightness_command_topic, base),
      brightnessStateTopic: resolveTopic(cp.brightness_state_topic, base),
      brightnessScale:
        typeof cp.brightness_scale === 'number' ? cp.brightness_scale : undefined,
      min: typeof cp.min === 'number' ? cp.min : undefined,
      max: typeof cp.max === 'number' ? cp.max : undefined,
      step: typeof cp.step === 'number' ? cp.step : undefined,
      options: Array.isArray(cp.options)
        ? (cp.options as unknown[]).map(String)
        : undefined,
      hasTemplate: hasTemplate || undefined,
    });
  }

  return entities;
}

/** Derive the device metadata (name/model/manufacturer) from the config's `dev` block. */
export function deriveDeviceMeta(config: HaRawConfig | undefined): {
  identifiers?: string;
  name?: string;
  model?: string;
  manufacturer?: string;
} {
  const dev = (config?.dev ?? config?.device) as
    | Record<string, unknown>
    | undefined;
  if (!dev) return {};
  return {
    identifiers: firstIdentifier(dev),
    name: asString(dev.name),
    model: asString(dev.mdl) ?? asString(dev.model),
    manufacturer: asString(dev.mf) ?? asString(dev.manufacturer),
  };
}

/**
 * Derive the availability contract from the config's `availability` array or
 * `availability_topic`, resolving `~` and defaulting payloads to `online`/`offline`.
 */
export function deriveAvailability(
  config: HaRawConfig | undefined,
): HaAvailability | undefined {
  if (!config) return undefined;
  const root = expand(config as Record<string, unknown>, ABBREVIATIONS);
  const base = asString(config['~']);

  let topic: string | undefined;
  let template: unknown;
  let entryOnline: string | undefined;
  let entryOffline: string | undefined;

  const list = root.availability;
  if (Array.isArray(list) && list.length > 0) {
    const first = list[0];
    if (first && typeof first === 'object') {
      const ax = expand(first as Record<string, unknown>, ABBREVIATIONS);
      topic = asString(ax.topic);
      template = ax.value_template;
      entryOnline = asString(ax.payload_available);
      entryOffline = asString(ax.payload_not_available);
    }
  } else if (typeof root.availability_topic === 'string') {
    topic = root.availability_topic;
    template = root.availability_template;
  }

  const resolved = resolveTopic(topic, base);
  if (!resolved) return undefined;

  return {
    topic: resolved,
    field: valueJsonField(template),
    payloadOnline: entryOnline ?? asString(root.payload_available) ?? 'online',
    payloadOffline:
      entryOffline ?? asString(root.payload_not_available) ?? 'offline',
  };
}
