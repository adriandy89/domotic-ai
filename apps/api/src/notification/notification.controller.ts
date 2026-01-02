import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { TelegramService } from './telegram.service';
import { EmailService } from './email.service';
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

// Interface for rule notification payload
interface IRuleTelegramNotificationPayload {
    ruleId: string;
    ruleName: string;
    resultId: string;
    event: string;
    userId: string;
    homeId: string;
    homeName: string;
    chatId: string;
}

// Interface for email rule notification payload
interface IRuleEmailNotificationPayload {
    ruleId: string;
    ruleName: string;
    resultId: string;
    event: string;
    userId: string;
    homeId: string;
    homeName: string;
    email: string;
}

@Controller('notification')
export class NotificationController {
    private readonly logger = new Logger(NotificationController.name);

    constructor(
        private readonly telegramService: TelegramService,
        private readonly emailService: EmailService,
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
                    if (user.email) {
                        await this.sendEmailNotification(user.email, deviceName, homeName, attributeKey);
                    } else {
                        this.logger.warn(`User ${user.id} has EMAIL channel but no email address`);
                    }
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

    // NATS Event Handler for Rule Telegram Notifications
    @EventPattern('notification.telegram')
    async handleRuleTelegramNotification(
        @Payload() payload: IRuleTelegramNotificationPayload,
    ) {
        this.logger.log(`Received telegram notification for rule ${payload.ruleId}`);

        try {
            // Build beautiful notification message
            const message = `🔔 <b>Rule Alert</b>

🏠 ${this.escapeHtml(payload.homeName)}
📋 ${this.escapeHtml(payload.ruleName)}

💬 ${this.escapeHtml(payload.event)}
`;

            const success = await this.telegramService.sendMessage(payload.chatId, message);

            if (success) {
                this.logger.log(`Telegram notification sent successfully for rule ${payload.ruleId}`);
            } else {
                this.logger.warn(`Failed to send telegram notification for rule ${payload.ruleId}`);
            }
        } catch (error) {
            this.logger.error(`Error sending telegram notification: ${error.message}`, error.stack);
        }
    }

    // NATS Event Handler for Rule Email Notifications
    @EventPattern('notification.email')
    async handleRuleEmailNotification(
        @Payload() payload: IRuleEmailNotificationPayload,
    ) {
        this.logger.log(`Received email notification for rule ${payload.ruleId}`);

        try {
            await this.emailService.sendRuleNotificationEmail(
                payload.email,
                payload.homeName,
                payload.ruleName,
                payload.event,
            );
            this.logger.log(`Email notification sent successfully for rule ${payload.ruleId}`);
        } catch (error) {
            this.logger.error(`Error sending email notification: ${error.message}`, error.stack);
        }
    }

    // === Private Methods ===

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

    private async sendEmailNotification(
        email: string,
        deviceName: string,
        homeName: string,
        attributeKey: string,
    ): Promise<void> {
        try {
            await this.emailService.sendNotificationEmail(
                email,
                homeName,
                deviceName,
                userAttrKeys[attributeKey as userAttr],
            );
            this.logger.log(`Email sensor notification sent to ${email}`);
        } catch (error) {
            this.logger.error(`Failed to send email sensor notification to ${email}: ${error.message}`);
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
