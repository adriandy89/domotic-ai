import { NotificationChannel } from 'generated/prisma/enums';

export interface IHomeConnectionNotificationUser {
  id: string;
  channels: NotificationChannel[];
  telegram_chat_id: string | null;
  email: string | null;
  is_active: boolean;
  language: string;
}

export interface IHomeConnectionNotification {
  homeId: string;
  homeName: string;
  connected: boolean;
  users: IHomeConnectionNotificationUser[];
}
