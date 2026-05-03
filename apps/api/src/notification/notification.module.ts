import { Module } from '@nestjs/common';
import { AiModule } from '../ai';
import { EmailService } from './email.service';
import { NotificationController } from './notification.controller';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';

@Module({
  imports: [AiModule],
  controllers: [TelegramController, NotificationController],
  providers: [TelegramService, EmailService],
  exports: [EmailService, TelegramService],
})
export class NotificationModule {}
