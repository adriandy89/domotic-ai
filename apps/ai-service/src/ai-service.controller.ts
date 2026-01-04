import { handleError } from '@app/nats-client';
import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { AiServiceService } from './ai-service.service';

interface AIGenerateRequest {
  userId: string;
  message: string;
  conversationId: string;
  timeZone?: string;
}

@Controller()
export class AiServiceController {
  private readonly logger = new Logger(AiServiceController.name);

  constructor(private readonly aiServiceService: AiServiceService) { }

  @EventPattern('ai.test')
  getHello(): string {
    return this.aiServiceService.getHello();
  }

  @EventPattern('ai.generate')
  async generateResponse(@Payload() data: AIGenerateRequest) {
    this.logger.log(`AI generate request for user: ${data.userId}, conversation: ${data.conversationId}`);
    return await this.aiServiceService.generateResponse(
      data.userId,
      data.message,
      data.conversationId,
      data.timeZone,
    ).catch((_error) => {
      handleError();
    });;
  }

  @EventPattern('ai.stats')
  getStats() {
    return this.aiServiceService.getAgentStats();
  }
}
