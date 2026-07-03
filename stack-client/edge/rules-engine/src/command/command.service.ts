import { Inject, Injectable, Logger } from '@nestjs/common';
import { EdgeDeviceMeta } from '../vendor/rules-evaluator';
import {
  getAdapter,
  isKnownProtocol,
  DeviceProtocol,
} from '../vendor/protocols';
import { MqttService } from '../mqtt/mqtt.service';
import { EDGE_CONFIG, EdgeConfig } from '../config';

/**
 * Turns a command object ({ attribute: value }) into MQTT message(s) using the
 * SAME protocol adapters as the central platform (vendored), then publishes them
 * to the local broker. zigbee2mqtt (also on the local broker) executes them.
 */
@Injectable()
export class CommandService {
  private readonly logger = new Logger(CommandService.name);

  constructor(
    @Inject(EDGE_CONFIG) private readonly config: EdgeConfig,
    private readonly mqtt: MqttService,
  ) {}

  /** Build + publish the command for a target device. Returns true on publish. */
  send(device: EdgeDeviceMeta, command: Record<string, unknown>): boolean {
    if (!command || Object.keys(command).length === 0) return false;
    if (!isKnownProtocol(device.protocol)) {
      this.logger.warn(`Unknown protocol "${device.protocol}"; skipping`);
      return false;
    }

    const adapter = getAdapter(device.protocol);
    const actions = adapter.getAvailableActions(device.attributes);
    const { command: normalized } = adapter.normalizeCommand(command, actions);

    if (actions.length > 0) {
      const validation = adapter.validateCommand(normalized, actions);
      if (!validation.valid) {
        this.logger.warn(
          `Command for ${device.uniqueId} rejected: ${JSON.stringify(
            validation.errors,
          )}`,
        );
        return false;
      }
    }

    const messages = adapter.buildCommandMessages(
      {
        homeUniqueId: this.config.homeUniqueId,
        deviceUniqueId: device.uniqueId,
        protocol: device.protocol as DeviceProtocol,
        attributes: device.attributes,
      },
      normalized,
    );

    if (messages.length === 0) {
      this.logger.warn(`Command for ${device.uniqueId} mapped to no messages`);
      return false;
    }

    for (const msg of messages) {
      this.mqtt.publish(msg.topic, msg.payload);
      this.logger.log(`→ ${msg.topic} ${msg.payload}`);
    }
    return true;
  }
}
