import {
  CommandMessage,
  DeviceAction,
  DeviceReadableAttribute,
  DeviceRef,
  DiscoveredDevice,
  NormalizeResult,
  ValidationResult,
} from './types';

/**
 * Translates one device protocol to/from the canonical capability model.
 *
 * Adding a new protocol means implementing this interface and registering it
 * (see `registry.ts`) — nothing in mqtt-core, the AI tools, rules, schedules,
 * the MCP server or the frontend changes. The architecture is open for extension,
 * closed for modification.
 */
export interface ProtocolAdapter {
  readonly protocol: string;

  /**
   * Parse a single entry from this protocol's discovery feed into a persistable
   * device. Return `null` to skip the entry (e.g. a coordinator/controller node,
   * or a discovery message that does not represent a controllable device).
   */
  parseDiscovery(raw: unknown): DiscoveredDevice | null;

  /** Writable actions derived from a device's persisted `attributes`. */
  getAvailableActions(attributes: unknown): DeviceAction[];

  /** Readable (published) attributes derived from a device's persisted `attributes`. */
  getReadableAttributes(attributes: unknown): DeviceReadableAttribute[];

  /** Convert user input to the device-native shape (units, color formats, ...). */
  normalizeCommand(
    command: Record<string, unknown>,
    actions: DeviceAction[],
  ): NormalizeResult;

  /** Validate a (normalized) command against the device's writable actions. */
  validateCommand(
    command: Record<string, unknown>,
    actions: DeviceAction[],
  ): ValidationResult;

  /**
   * Optional: merge a re-discovered entry into the device's already-persisted
   * `attributes`. HA-Discovery devices accumulate multiple entities across separate
   * discovery messages; Zigbee replaces wholesale (no implementation → replacement).
   */
  mergeDiscovery?(existingAttributes: unknown, discovered: DiscoveredDevice): unknown;

  /**
   * Build the MQTT message(s) to publish for a normalized command.
   * Zigbee returns a single message to `home/id/{home}/zigbee/{id}/set`;
   * HA-Discovery returns one message per targeted entity using its own
   * `command_topic` (which can differ per entity).
   */
  buildCommandMessages(
    device: DeviceRef,
    command: Record<string, unknown>,
  ): CommandMessage[];
}
