import { Controller } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { MessagePattern } from '@nestjs/microservices';

@Controller()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) { }

  @MessagePattern('notifications.health')
  healthCheck(): { ok: boolean } {
    return this.notificationsService.healthCheck();
  }
}
