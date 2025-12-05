import { Role } from "generated/prisma/enums";

export interface SessionUser {
    id: string;
    email: string;
    name: string;
    is_org_admin: boolean;
    organization_id: string;
    is_active: boolean;
    role: Role;
    phone: string | null;
    attributes: any;
    telegram_chat_id: string | null;
    channels: any;
    notification_batch_minutes: number | null;
    created_at: Date;
    updated_at: Date | null;
}
