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
import { HaDeviceAttributes, HaEntity } from './ha-config.types';
import { parseHaEntity } from './parse-ha-config';

/** Protocols that share the HA-Discovery contract. */
const HA_PROTOCOLS = new Set<string>([
  DeviceProtocol.ZWAVE,
  DeviceProtocol.WIFI,
  DeviceProtocol.BLE,
]);

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
   * Parse one discovery message into a single-entity device. mqtt-core merges
   * successive messages for the same physical device via {@link mergeDiscovery}.
   */
  parseDiscovery(raw: unknown): DiscoveredDevice | null {
    const parsed = parseHaEntity(raw as never);
    if (!parsed) return null;

    const { deviceIdentifier, deviceMeta, entity } = parsed;
    const protocol = inferProtocol(entity);

    const attributes: HaDeviceAttributes = {
      source: 'hadiscovery',
      protocol: protocol ?? DeviceProtocol.WIFI,
      device: {
        identifiers: deviceIdentifier,
        name: deviceMeta.name,
        model: deviceMeta.model,
        manufacturer: deviceMeta.manufacturer,
      },
      entities: { [entity.uniqueId]: entity },
    };

    return {
      uniqueId: deviceIdentifier,
      name: deviceMeta.name || entity.name || deviceIdentifier,
      model: deviceMeta.model,
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
    if (!existing || existing.source !== 'hadiscovery') return incoming;

    return {
      ...existing,
      device: { ...existing.device, ...incoming.device },
      entities: { ...existing.entities, ...incoming.entities },
    } satisfies HaDeviceAttributes;
  }

  getAvailableActions(attributes: unknown): DeviceAction[] {
    const entities = readEntities(attributes);
    const actions: DeviceAction[] = [];

    for (const entity of entities) {
      // Read-only or un-evaluatable entities expose no actions.
      if (!entity.commandTopic || entity.hasTemplate) continue;

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

    return dedupeByProperty(actions);
  }

  getReadableAttributes(attributes: unknown): DeviceReadableAttribute[] {
    const entities = readEntities(attributes);
    const result: DeviceReadableAttribute[] = [];

    for (const entity of entities) {
      if (!entity.stateTopic) continue;
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
      if (lower === 'on' && action.valueOn !== undefined) out[key] = action.valueOn;
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

function readEntities(attributes: unknown): HaEntity[] {
  const attrs = attributes as HaDeviceAttributes | undefined;
  if (!attrs || attrs.source !== 'hadiscovery' || !attrs.entities) return [];
  return Object.values(attrs.entities);
}

/** Infer zwave|wifi|ble from `home/id/{uuid}/{protocol}/...` in the entity topics. */
function inferProtocol(entity: HaEntity): string | undefined {
  const topic = entity.commandTopic || entity.stateTopic;
  if (!topic) return undefined;
  const parts = topic.split('/');
  // ['home','id',uuid,<protocol>,...]
  const candidate = parts[3];
  return HA_PROTOCOLS.has(candidate) ? candidate : undefined;
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
