import { Injectable } from '@nestjs/common';

@Injectable()
export class NotificationsService {
  healthCheck(): { ok: boolean } {
    return { ok: true };
  }
}
