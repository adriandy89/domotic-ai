import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';

@Module({
  imports: [],
  controllers: [TelegramController, NotificationController],
  providers: [TelegramService],
})
export class NotificationModule { }
