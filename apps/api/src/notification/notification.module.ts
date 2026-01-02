import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { EmailService } from './email.service';

@Module({
  imports: [],
  controllers: [TelegramController, NotificationController],
  providers: [TelegramService, EmailService],
})
export class NotificationModule { }
