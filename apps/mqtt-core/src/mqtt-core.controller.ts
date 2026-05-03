import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { MqttCoreService, PublishCommandResult } from './mqtt-core.service';

interface PublishCommandPayload {
  homeUniqueId: string;
  deviceUniqueId: string;
  organizationId: string;
  command: Record<string, unknown>;
  /** Origin of the command — used for audit. Defaults to 'api'. */
  source?: 'api' | 'ai' | 'rule' | 'schedule';
  /** User id originating the command (for audit). */
  userId?: string;
}

@Controller()
export class MqttCoreController {
  private readonly logger = new Logger(MqttCoreController.name);

  constructor(private readonly mqttCoreService: MqttCoreService) {}

  @MessagePattern('mqtt-core.publish-command')
  async publishCommand(
    @Payload() payload: PublishCommandPayload,
  ): Promise<PublishCommandResult> {
    try {
      return await this.mqttCoreService.publishCommand(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `publishCommand failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      return { ok: false, code: 'PUBLISH_FAILED', error: message };
    }
  }
}
