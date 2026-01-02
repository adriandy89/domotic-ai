import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { TelegramService } from './telegram.service';
import type { IUserSensorNotification, userAttr } from '@app/models';
import { NotificationChannel } from 'generated/prisma/enums';

const userAttrKeys: {
    [key in userAttr]: string;
} = {
    contactTrue: 'Contact Closed',
    contactFalse: 'Contact Opened',
    vibrationTrue: 'Vibration',
    occupancyTrue: 'Occupancy',
    presenceTrue: 'Presence',
    smokeTrue: 'Smoke',
    waterLeakTrue: 'Water Leak',
};

@Controller('notification')
export class NotificationController {
    private readonly logger = new Logger(NotificationController.name);

    constructor(
        private readonly telegramService: TelegramService,
    ) { }

    @EventPattern('mqtt-core.user.sensor-notification')
    async handleSensorNotification(
        @Payload() payload: IUserSensorNotification,
    ) {
        // Debug: log the raw payload to see its structure
        this.logger.debug(`Raw payload received: ${JSON.stringify(payload)}`);

        if (!payload || !payload.user) {
            this.logger.error(`Invalid payload received: missing user data.`);
            return;
        }

        this.logger.log(`Received sensor notification for user ${payload.user.id}`);

        const { user, deviceName, homeName, attributeKey, sensorKey, sensorValue } = payload;

        // Check which channels the user has enabled
        for (const channel of user.channels) {
            switch (channel) {
                case NotificationChannel.TELEGRAM:
                    if (user.telegram_chat_id) {
                        await this.sendTelegramNotification(user.telegram_chat_id, deviceName, homeName, attributeKey);
                    } else {
                        this.logger.warn(`User ${user.id} has TELEGRAM channel but no chat_id linked`);
                    }
                    break;

                case NotificationChannel.EMAIL:
                    this.logger.log(`EMAIL notification not implemented. User: ${user.id}, Device: ${deviceName}, Attribute: ${attributeKey}`);
                    break;

                case NotificationChannel.SMS:
                    this.logger.log(`SMS notification not implemented. User: ${user.id}, Device: ${deviceName}, Attribute: ${attributeKey}`);
                    break;

                case NotificationChannel.PUSH:
                    this.logger.log(`PUSH notification not implemented. User: ${user.id}, Device: ${deviceName}, Attribute: ${attributeKey}`);
                    break;

                case NotificationChannel.WEBHOOK:
                    this.logger.log(`WEBHOOK notification not implemented. User: ${user.id}, Device: ${deviceName}, Attribute: ${attributeKey}`);
                    break;

                default:
                    this.logger.warn(`Unknown notification channel: ${channel}`);
            }
        }
    }

    private async sendTelegramNotification(
        chatId: string,
        deviceName: string,
        homeName: string,
        attributeKey: string,
    ): Promise<void> {
        const message = `🏠 <b>${this.escapeHtml(homeName)}</b> 
📱 ${this.escapeHtml(deviceName)}

📈 <b>${userAttrKeys[attributeKey as userAttr]} detected</b>
`;

        const success = await this.telegramService.sendMessage(chatId, message);

        if (success) {
            this.logger.log(`Telegram sensor notification sent to ${chatId}`);
        } else {
            this.logger.warn(`Failed to send telegram sensor notification to ${chatId}`);
        }
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}
