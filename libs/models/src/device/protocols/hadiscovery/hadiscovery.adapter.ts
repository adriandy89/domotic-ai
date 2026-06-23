import { ProtocolAdapter } from '../protocol-adapter.interface';
import {
  CommandMessage,
  DeviceAction,
  DeviceProtocol,
  DeviceReadableAttribute,
  DeviceRef,
  DiscoveredDevice,
  NormalizeResult,
  ValidationResult,
} from '../types';
import { validateCommand } from '../shared/validate-command';
import { HaDeviceAttributes, HaEntity, HaRawConfig } from './ha-config.types';
import {
  deriveDeviceMeta,
  deriveEntities,
  HA_META_KEYS,
  toCanonicalConfig,
} from './parse-ha-config';

/** Protocols that share the HA-Discovery contract. */
const HA_PROTOCOLS = new Set<string>([
  DeviceProtocol.ZWAVE,
  DeviceProtocol.WIFI,
  DeviceProtocol.BLE,
]);

/** True when `p` is a protocol handled by the HA-Discovery adapter (zwave/wifi/ble). */
export function isHaProtocol(p: string): boolean {
  return HA_PROTOCOLS.has(p);
}

/** Components whose main entity maps to a binary on/off action. */
const BINARY_COMPONENTS = new Set(['switch', 'light', 'fan']);

/**
 * Home Assistant MQTT Discovery adapter — a single adapter shared by Z-Wave, WiFi
 * and BLE. Every official bridge (zwave-js-ui, ESPHome, theengs/gateway) can publish
 * the standard `homeassistant/<component>/.../config` retained messages; this adapter
 * is the one place that understands that contract.
 *
 * No Home Assistant is installed anywhere — we only consume the message format.
 */
export class HaDiscoveryAdapter implements ProtocolAdapter {
  readonly protocol = 'hadiscovery';

  /**
   * Parse one discovery message into a device, storing the **complete raw config** in
   * `attributes` (like the Zigbee adapter stores the bridge object). Capabilities are
   * derived at read time. mqtt-core merges successive messages via {@link mergeDiscovery}.
   */
  parseDiscovery(raw: unknown): DiscoveredDevice | null {
    const config = toCanonicalConfig(raw as never);
    if (!config) return null;

    const protocol = inferProtocol(config);
    const meta = deriveDeviceMeta(config);
    const identifier =
      meta.identifiers || deriveEntities(config)[0]?.uniqueId || 'unknown';

    const attributes: HaDeviceAttributes = {
      source: 'hadiscovery',
      // Inferred strictly from the entity topics; never defaulted. mqtt-core drops
      // the discovery when this is undefined.
      protocol,
      config,
    };

    return {
      uniqueId: identifier,
      name: meta.name || identifier,
      model: meta.model,
      attributes,
      protocol,
    };
  }

  mergeDiscovery(
    existingAttributes: unknown,
    discovered: DiscoveredDevice,
  ): unknown {
    const incoming = discovered.attributes as HaDeviceAttributes;
    const existing = existingAttributes as HaDeviceAttributes | undefined;
    if (!existing || existing.source !== 'hadiscovery' || !existing.config) {
      return incoming;
    }

    // Deep-merge the raw config: components merge by object id (authoritative discovery
    // supersedes synthesized aggregate-state entries), and incoming top-level keys
    // (`~`/`dev`/`stat_t`/`availability`/`payload_*`/`o`) overlay the existing ones.
    const merged: HaRawConfig = {
      ...existing.config,
      ...incoming.config,
      cmps: { ...existing.config.cmps, ...incoming.config.cmps },
    };

    return {
      source: 'hadiscovery',
      protocol: incoming.protocol ?? existing.protocol,
      config: merged,
    } satisfies HaDeviceAttributes;
  }

  getAvailableActions(attributes: unknown): DeviceAction[] {
    const entities = readEntities(attributes);
    const actions: DeviceAction[] = [];

    for (const entity of entities) {
      // No command topic → read-only. A command_template means the outgoing
      // payload needs templating we can't render; a value_template only affects
      // incoming state decoding and doesn't block commands (HA semantics).
      if (!entity.commandTopic || entity.commandTemplate) continue;

      if (BINARY_COMPONENTS.has(entity.component)) {
        actions.push({
          property: entity.property,
          type: 'binary',
          label: entity.name,
          valueOn: entity.payloadOn ?? 'ON',
          valueOff: entity.payloadOff ?? 'OFF',
        });
        if (entity.component === 'light' && entity.brightnessCommandTopic) {
          actions.push({
            property: `${entity.property}_brightness`,
            type: 'numeric',
            label: entity.name ? `${entity.name} brightness` : 'brightness',
            valueMin: 0,
            valueMax: entity.brightnessScale ?? 255,
          });
        }
      } else if (entity.component === 'number') {
        actions.push({
          property: entity.property,
          type: 'numeric',
          label: entity.name,
          unit: entity.unit,
          valueMin: entity.min,
          valueMax: entity.max,
          valueStep: entity.step,
        });
      } else if (entity.component === 'select') {
        actions.push({
          property: entity.property,
          type: 'enum',
          label: entity.name,
          values: entity.options ?? [],
        });
      } else if (entity.component === 'lock') {
        actions.push({
          property: entity.property,
          type: 'binary',
          label: entity.name,
          valueOn: entity.payloadOn ?? 'LOCK',
          valueOff: entity.payloadOff ?? 'UNLOCK',
        });
      }
    }

    // The ESP32 relay firmware exposes its on-board scheduler as a `schedule`
    // `text` component, written via the shared `…/set` topic with a wrapped
    // `{"schedule":[...]}` payload (see buildCommandMessages). Surface it as a
    // writable action so the command validates — independent of whether the
    // component declares its own command_topic, since it reuses the device's set
    // topic. The entity loop above skips it (text isn't a known command type).
    const hasSchedule = entities.some(
      (e) => e.component === 'text' && e.property === 'schedule',
    );
    const hasCommandTopic = entities.some((e) => e.commandTopic);
    if (hasSchedule && hasCommandTopic) {
      actions.push({ property: 'schedule', type: 'schedule', label: 'Schedule' });
    }

    return dedupeByProperty(actions);
  }

  getReadableAttributes(attributes: unknown): DeviceReadableAttribute[] {
    const entities = readEntities(attributes);
    const result: DeviceReadableAttribute[] = [];

    for (const entity of entities) {
      if (!entity.stateTopic) continue;
      // Metadata keys (ts/timestamp/device) stay in the stored config but are not
      // surfaced as readable sensors.
      if (HA_META_KEYS.has(entity.property)) continue;
      const type =
        entity.component === 'binary_sensor'
          ? 'binary'
          : entity.component === 'sensor'
            ? 'numeric'
            : entity.component;
      result.push({
        property: entity.property,
        type,
        unit: entity.unit,
        values: entity.options,
        stateClass: entity.stateClass,
        deviceClass: entity.deviceClass,
      });
    }

    return dedupeByProperty(result);
  }

  normalizeCommand(
    command: Record<string, unknown>,
    actions: DeviceAction[],
  ): NormalizeResult {
    const out: Record<string, unknown> = { ...command };
    for (const key of Object.keys(out)) {
      const action = actions.find((a) => a.property === key);
      if (!action || action.type !== 'binary') continue;
      const value = out[key];
      if (typeof value !== 'string') continue;
      const lower = value.toLowerCase();
      if (lower === 'on' && action.valueOn !== undefined)
        out[key] = action.valueOn;
      else if (lower === 'off' && action.valueOff !== undefined)
        out[key] = action.valueOff;
      else if (lower === 'toggle' && action.valueToggle !== undefined)
        out[key] = action.valueToggle;
    }
    return { command: out, warnings: [] };
  }

  validateCommand(
    command: Record<string, unknown>,
    actions: DeviceAction[],
  ): ValidationResult {
    return validateCommand(command, actions);
  }

  buildCommandMessages(
    device: DeviceRef,
    command: Record<string, unknown>,
  ): CommandMessage[] {
    const entities = readEntities(device.attributes);
    const messages: CommandMessage[] = [];

    for (const [key, value] of Object.entries(command)) {
      // Brightness sub-action: `${entity.property}_brightness`.
      const brightnessEntity = entities.find(
        (e) => `${e.property}_brightness` === key && e.brightnessCommandTopic,
      );
      if (brightnessEntity) {
        messages.push({
          topic: brightnessEntity.brightnessCommandTopic as string,
          payload: toPayload(value),
        });
        continue;
      }

      // On-device scheduler: the firmware expects the whole array wrapped as
      // `{"schedule":[...]}` on the shared `…/set` topic (the same topic the
      // relay uses). Reuse the schedule's own command topic when declared, else
      // any sibling command topic — every component shares `~/set`.
      if (key === 'schedule') {
        const topic =
          entities.find((e) => e.property === 'schedule' && e.commandTopic)
            ?.commandTopic ?? entities.find((e) => e.commandTopic)?.commandTopic;
        if (!topic) continue;
        messages.push({ topic, payload: JSON.stringify({ schedule: value }) });
        continue;
      }

      const entity = entities.find((e) => e.property === key && e.commandTopic);
      if (!entity) continue;
      messages.push({
        topic: entity.commandTopic as string,
        payload: toPayload(value),
      });
    }

    return messages;
  }
}

/**
 * Build a synthetic raw config from one aggregate JSON state payload, for a device that
 * publishes everything on a single `…/{deviceId}/state` topic without ever sending
 * HA-Discovery configs. Each scalar key becomes a read-only `sensor` (or `binary_sensor`
 * for on/off values) component sharing that state topic, so the device exposes readable
 * attributes immediately; a later discovery `config` enriches/overrides these via
 * {@link HaDiscoveryAdapter.mergeDiscovery}. Nested objects/arrays and meta keys are skipped.
 */
export function synthesizeConfig(
  deviceId: string,
  stateTopic: string,
  payload: Record<string, unknown>,
): HaRawConfig {
  const cmps: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (HA_META_KEYS.has(key)) continue;
    if (value === null || typeof value === 'object') continue; // scalars only

    const isBinary =
      typeof value === 'boolean' ||
      (typeof value === 'string' && /^(on|off|true|false)$/i.test(value));
    cmps[key] = {
      p: isBinary ? 'binary_sensor' : 'sensor',
      state_topic: stateTopic,
      value_template: `{{value_json.${key}}}`,
      unique_id: `${deviceId}_${key}`,
    };
  }
  return { dev: { ids: [deviceId], name: deviceId }, cmps };
}

function readEntities(attributes: unknown): HaEntity[] {
  const attrs = attributes as HaDeviceAttributes | undefined;
  if (!attrs || attrs.source !== 'hadiscovery' || !attrs.config) return [];
  return deriveEntities(attrs.config);
}

/**
 * Infer zwave|wifi|ble from `home/id/{uuid}/{protocol}/...` in the (resolved) entity
 * topics derived from the config. Returns the first protocol that resolves.
 */
function inferProtocol(config: HaRawConfig): string | undefined {
  for (const entity of deriveEntities(config)) {
    const topic = entity.commandTopic || entity.stateTopic;
    if (!topic) continue;
    const parts = topic.split('/');
    // ['home','id',uuid,<protocol>,...]
    const candidate = parts[3];
    if (HA_PROTOCOLS.has(candidate)) return candidate;
  }
  return undefined;
}

function toPayload(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function dedupeByProperty<T extends { property: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    if (seen.has(i.property)) return false;
    seen.add(i.property);
    return true;
  });
}
