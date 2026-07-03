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
import {
  getAvailableActions,
  getExposesFromAttributes,
  getReadableAttributes,
} from './parse-exposes';
import { normalizeCommand } from './normalize-command';

/** Shape of a single entry in zigbee2mqtt's `bridge/devices` payload. */
interface ZigbeeBridgeDevice {
  friendly_name?: string;
  model_id?: string;
  type?: string;
  definition?: { description?: string; exposes?: unknown };
}

const NAME_MAX_LEN = 124;

/**
 * Zigbee adapter — speaks zigbee2mqtt's native `exposes` model, the richest source
 * for Zigbee devices (composites, color formats, brightness/mireds scaling).
 */
export class ZigbeeAdapter implements ProtocolAdapter {
  readonly protocol = DeviceProtocol.ZIGBEE;

  parseDiscovery(raw: unknown): DiscoveredDevice | null {
    if (!raw || typeof raw !== 'object') return null;
    const item = raw as ZigbeeBridgeDevice;

    // Skip the coordinator: it is not a controllable device.
    if (item.type === 'Coordinator') return null;
    if (!item.friendly_name) return null;

    const name =
      item.definition?.description?.slice(0, NAME_MAX_LEN) ||
      item.friendly_name;

    return {
      uniqueId: item.friendly_name,
      name,
      model: item.model_id,
      attributes: item,
    };
  }

  getAvailableActions(attributes: unknown): DeviceAction[] {
    return getAvailableActions(getExposesFromAttributes(attributes));
  }

  getReadableAttributes(attributes: unknown): DeviceReadableAttribute[] {
    return getReadableAttributes(getExposesFromAttributes(attributes));
  }

  normalizeCommand(
    command: Record<string, unknown>,
    actions: DeviceAction[],
  ): NormalizeResult {
    return normalizeCommand(command, actions);
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
    return [
      {
        topic: `home/id/${device.homeUniqueId}/${DeviceProtocol.ZIGBEE}/${device.deviceUniqueId}/set`,
        payload: JSON.stringify(command),
      },
    ];
  }
}
