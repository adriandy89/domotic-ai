import { NatsClientService } from '@app/nats-client';
import { Injectable, Logger } from '@nestjs/common';

export interface AIChatRequest {
  userId: string;
  message: string;
  conversationId: string;
  timeZone?: string;
}

export interface AIChatResponse {
  response: string;
  conversationId: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly natsClient: NatsClientService) { }

  /**
   * Envía un mensaje al agente de IA y recibe una respuesta
   */
  async chat(request: AIChatRequest) {
    this.logger.log(`Sending message to AI service for user: ${request.userId}`);

    try {
      const response = await
        this.natsClient.sendMessage('ai.generate', {
          userId: request.userId,
          message: request.message,
          conversationId: request.conversationId,
          timeZone: request.timeZone,
        });

      return {
        response,
        conversationId: request.conversationId,
      };
    } catch (error) {
      this.logger.error('Error calling AI service:', error);
      throw error;
    }
  }

  /**
   * Obtiene estadísticas de los agentes de IA
   */
  async getStats() {
    this.logger.log('Getting AI agent stats');

    try {
      return await this.natsClient.sendMessage('ai.stats', {});
    } catch (error) {
      this.logger.error('Error getting AI stats:', error);
      throw error;
    }
  }
}
