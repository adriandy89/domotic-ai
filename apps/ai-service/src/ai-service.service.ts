import { Injectable, Logger } from '@nestjs/common';
import { MastraService } from './mastra';

@Injectable()
export class AiServiceService {
  private readonly logger = new Logger(AiServiceService.name);

  constructor(private readonly mastraService: MastraService) { }

  getHello(): string {
    return 'AI Service is running with Mastra AI';
  }

  /**
   * Genera una respuesta de IA para un usuario
   * @param userId - ID del usuario
   * @param message - Mensaje del usuario
   * @param conversationId - ID de conversación (usado como threadId en Mastra)
   * @param timeZone - Zona horaria del usuario (opcional)
   */
  async generateResponse(
    userId: string,
    message: string,
    conversationId: string,
    timeZone?: string,
  ): Promise<string> {
    this.logger.log(`Generating AI response for user: ${userId}, conversation: ${conversationId}`);
    return this.mastraService.generateResponse(userId, message, conversationId, timeZone);
  }
}
