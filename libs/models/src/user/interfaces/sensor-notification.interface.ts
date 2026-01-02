import { JsonValue } from "@prisma/client/runtime/client";
import { NotificationChannel } from "generated/prisma/enums";

export interface IUserSensorNotification {
    deviceName: string;
    homeName: string;
    user: {
        id: string;
        attributes: JsonValue;
        channels: NotificationChannel[];
        telegram_chat_id: string | null;
        email: string | null;
        is_active: boolean;
    };
    homeId: string;
    deviceId: string;
    attributeKey: string;
    sensorKey: string;
    sensorValue: string | number | boolean;
}