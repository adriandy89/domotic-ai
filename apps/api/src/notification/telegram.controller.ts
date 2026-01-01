import { Body, Controller, Headers, HttpCode, HttpStatus, Logger, Param, Post, UseGuards } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { TelegramService } from './telegram.service';
import { AuthenticatedGuard } from '../auth';
import { ApiParam } from '@nestjs/swagger';
import { GetUserInfo, Permissions } from '../auth/decorators';
import { Role } from 'generated/prisma/enums';
import { PermissionsGuard } from '../auth/guards';
import type { SessionUser } from '@app/models';

// Interface for rule notification payload
interface IRuleNotificationPayload {
  ruleId: string;
  ruleName: string;
  resultId: string;
  event: string;
  userId: string;
  homeId: string;
  homeName: string;
  chatId: string;
}

@Controller('telegram')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(
    private readonly telegramService: TelegramService,
  ) {
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() update: any,
    @Headers('x-telegram-bot-api-secret-token') secretToken: string,
  ) {
    this.logger.log('Received Telegram webhook update');
    try {
      await this.telegramService.processWebhookUpdate(update, secretToken);

      return { success: true };
    } catch (error) {
      this.logger.error(`Error handling webhook: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  @Post('user/:id/generate-code')
  @ApiParam({ name: 'id', type: String, required: true })
  @UseGuards(AuthenticatedGuard)
  @Permissions([Role.USER, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async generateTelegramVerificationCode(
    @Param('id') id: string,
    @GetUserInfo() user: SessionUser,
  ) {
    // Verify that the authenticated user is the same as the one requesting the code
    // or has admin permissions
    if (user.id !== id && user.role !== Role.MANAGER && user.role !== Role.ADMIN) {
      return {
        success: false,
        error: 'You do not have permission to perform this action',
      };
    }
    try {
      const code = await this.telegramService.generateVerificationCode(id);
      return {
        success: true,
        code,
        botLink: this.telegramService.getBotLink(),
        instructions:
          'Start a conversation with our Telegram bot and send the command /verify followed by this code.',
      };
    } catch (error) {
      this.logger.error(`Error generating Telegram code: ${error.message}`, error.stack);
      return {
        success: false,
        error: 'Could not generate verification code',
      };
    }
  }

  // NATS Event Handler for Rule Notifications
  @EventPattern('notification.telegram')
  async handleRuleNotification(
    @Payload() payload: IRuleNotificationPayload,
  ) {
    this.logger.log(`Received telegram notification for rule ${payload.ruleId}`);

    try {
      // Build beautiful notification message
      const message = `🔔 <b>Rule Alert</b>

🏠 ${this.escapeHtml(payload.homeName)}
📋 ${this.escapeHtml(payload.ruleName)}

💬 ${this.escapeHtml(payload.event)}
`;

      const success = await this.telegramService.sendMessage(payload.chatId, message);

      if (success) {
        this.logger.log(`Telegram notification sent successfully for rule ${payload.ruleId}`);
      } else {
        this.logger.warn(`Failed to send telegram notification for rule ${payload.ruleId}`);
      }
    } catch (error) {
      this.logger.error(`Error sending telegram notification: ${error.message}`, error.stack);
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
