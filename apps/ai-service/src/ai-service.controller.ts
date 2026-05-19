import { handleError } from '@app/nats-client';
import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { AiServiceService } from './ai-service.service';
import { MastraService } from './mastra/mastra.service';

interface AIGenerateRequest {
  userId: string;
  message: string;
  conversationId: string;
  timeZone?: string;
}

interface AiConfigUpdatedEvent {
  organizationId: string;
}

@Controller()
export class AiServiceController {
  private readonly logger = new Logger(AiServiceController.name);

  constructor(
    private readonly aiServiceService: AiServiceService,
    private readonly mastraService: MastraService,
  ) {}

  @EventPattern('ai.test')
  getHello(): string {
    return this.aiServiceService.getHello();
  }

  @EventPattern('ai.generate')
  async generateResponse(@Payload() data: AIGenerateRequest) {
    this.logger.log(
      `AI generate request for user: ${data.userId}, conversation: ${data.conversationId}`,
    );
    return await this.aiServiceService
      .generateResponse(
        data.userId,
        data.message,
        data.conversationId,
        data.timeZone,
      )
      .catch((_error) => {
        handleError();
      });
  }

  @EventPattern('ai.config.updated')
  async handleAiConfigUpdated(@Payload() data: AiConfigUpdatedEvent) {
    this.logger.log(`Received ai.config.updated for org: ${data.organizationId}`);
    await this.mastraService.invalidateCache(data.organizationId);
  }
}
