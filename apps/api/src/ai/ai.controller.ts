import type { SessionUser } from '@app/models';
import { ChatMessageDto } from '@app/models';
import { Body, Controller, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetUserInfo } from '../auth/decorators';
import { AuthenticatedGuard } from '../auth/guards';
import { AIChatRequest, AiService } from './ai.service';

@ApiTags('AI')
@Controller('ai')
@UseGuards(AuthenticatedGuard)
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(private readonly aiService: AiService) { }

  @Post('chat')
  @ApiOperation({
    summary: 'Send a message to the AI assistant',
    description:
      'Chat with the AI assistant. Supports conversation continuity through conversationId.',
  })
  async chat(@Body() body: ChatMessageDto, @GetUserInfo() user: SessionUser) {
    const userId = user.id;

    // Generar nuevo conversationId si no se proporciona
    const conversationId = body.conversationId || user.id;

    const request: AIChatRequest = {
      userId,
      message: body.message,
      conversationId,
      timeZone: body.timeZone,
    };

    this.logger.log(`User ${userId} sent message: "${body.message.substring(0, 50)}..."`);

    const response = await this.aiService.chat(request);

    return {
      message: response.response,
      conversationId: response.conversationId,
    };
  }
}
