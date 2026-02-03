import type { SessionUser } from '@app/models';
import { Body, Controller, Headers, HttpCode, HttpStatus, Logger, Param, Post, UseGuards } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { Role } from 'generated/prisma/enums';
import { AuthenticatedGuard } from '../auth';
import { GetUserInfo, Permissions } from '../auth/decorators';
import { PermissionsGuard } from '../auth/guards';
import { TelegramService } from './telegram.service';

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
      setImmediate(async () => {
        try {
          await this.telegramService.processWebhookUpdate(update, secretToken);
        } catch (error) {
          this.logger.error(`Error processing webhook: ${error.message}`, error.stack);
        }
      });

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

}
