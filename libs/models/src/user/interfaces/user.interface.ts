import { RoleTrack } from '../enums';

export interface IUser {
  id: string;
  is_org_admin: boolean;
  email: string;
  phone?: string;
  name: string;
  attributes?: any;
  is_active: boolean;
  organization_id: string;
  updated_at?: Date;
  created_at: Date;
  role: RoleTrack;
  expiration_time?: Date;
  notification_batch_minutes?: number;
  fmc_tokens?: string[];
  telegram_chat_id?: string;
}
