import { DeviceProtocol } from '@app/models';
import { Injectable, Logger } from '@nestjs/common';
import { PublishCommandResult } from './mqtt-core.types';
import { DeviceAvailabilityService } from './services/device-availability.service';
import { DeviceCommandService } from './services/device-command.service';
import { HaIngestionService } from './services/ha-ingestion.service';
import { ZigbeeIngestionService } from './services/zigbee-ingestion.service';

export type { PublishCommandResult } from './mqtt-core.types';

/**
 * Facade of the mqtt-core app: routes every incoming MQTT message to the
 * service that owns its topic shape, and exposes command publishing to the
 * NATS controller. All actual work lives in the services under ./services:
 *
 *  - {@link ZigbeeIngestionService}    — zigbee2mqtt discovery + state
 *  - {@link HaIngestionService}        — HA-Discovery configs + zwave/wifi/ble state
 *  - {@link DeviceAvailabilityService} — per-device online/offline messages
 *  - {@link DeviceCommandService}      — outgoing commands (validation, rate limit, audit)
 */
@Injectable()
export class MqttCoreService {
  private readonly logger = new Logger(MqttCoreService.name);

  constructor(
    private readonly zigbeeIngestion: ZigbeeIngestionService,
    private readonly haIngestion: HaIngestionService,
    private readonly deviceAvailability: DeviceAvailabilityService,
    private readonly deviceCommand: DeviceCommandService,
  ) {}

  /**
   * Routes an incoming MQTT message by topic shape:
   *   home/id/{home}/{protocol}/bridge/devices        → Zigbee discovery
   *   home/id/{home}/discovery/<component>/.../config  → HA-Discovery (zwave/wifi/ble)
   *   home/id/{home}/zigbee/{device}                   → Zigbee state
   *   home/id/{home}/{protocol}/...                    → HA state (via index)
   */
  async handleMessage(topic: string, bufferMsg: Buffer) {
    try {
      const parts = topic.split('/');
      if (parts.length < 4) return;
      const homeUniqueId = parts[2];
      const seg3 = parts[3];

      if (seg3 === 'discovery') {
        return this.haIngestion.handleHaDiscovery(
          homeUniqueId,
          parts.slice(4),
          bufferMsg,
        );
      }

      const protocol = seg3;

      // Device availability for any protocol:
      //   home/id/{home}/{protocol}/{deviceId}/availability
      // (`bridge` is the zigbee2mqtt bridge, never a device.)
      if (
        parts.length === 6 &&
        parts[5] === 'availability' &&
        parts[4] !== 'bridge'
      ) {
        return this.deviceAvailability.handleDeviceAvailability(
          homeUniqueId,
          protocol,
          parts[4],
          bufferMsg,
        );
      }

      const isBridgeDevices =
        parts[4] === 'bridge' && parts[5] === 'devices' && parts.length === 6;
      if (isBridgeDevices) {
        if (protocol !== DeviceProtocol.ZIGBEE) return;
        return this.zigbeeIngestion.handleZigbeeBridgeDevices(
          homeUniqueId,
          bufferMsg,
        );
      }

      if (protocol === DeviceProtocol.ZIGBEE) {
        // Device state lives exactly at home/id/{home}/zigbee/{device}.
        // Sub-topics (availability, bridge/*) are ignored.
        if (parts.length !== 5) return;
        return this.zigbeeIngestion.handleZigbeeState(
          homeUniqueId,
          parts[4],
          bufferMsg,
        );
      }

      // Z-Wave / WiFi / BLE state — resolved via the HA-Discovery index.
      return this.haIngestion.handleHaState(topic, homeUniqueId, bufferMsg);
    } catch (error: unknown) {
      this.logger.error(
        `Error handling message on topic=${topic}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async publishCommand(payload: {
    homeUniqueId: string;
    deviceUniqueId: string;
    organizationId: string;
    command: Record<string, unknown>;
    /** Origin of the command — used for the audit trail. */
    source?: 'api' | 'ai' | 'rule' | 'schedule';
    /** Optional originating user id for the audit trail. */
    userId?: string;
  }): Promise<PublishCommandResult> {
    return this.deviceCommand.publishCommand(payload);
  }
}
