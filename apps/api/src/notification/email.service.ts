import { CacheService } from '@app/cache';
import { DbService } from '@app/db';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
const nodemailer = require("nodemailer");

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  // --- Configuration Properties ---
  private readonly baseUrl: string;
  private readonly transporter;
  private readonly emailUser: string;
  private readonly emailPass: string;

  constructor(
    private readonly config: ConfigService,
    private readonly dbService: DbService,
    private readonly cacheService: CacheService,
  ) {
    this.baseUrl = this.config.get<string>('PUBLIC_APP_URL', 'http://localhost:3003');
    this.emailUser = this.config.get<string>('EMAIL_USER', '');
    this.emailPass = this.config.get<string>('EMAIL_PASS', '');
    if (this.emailUser && this.emailPass) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: this.emailUser,
          pass: this.emailPass,
        },
      });
    }
  }

  /**
   * Send a notification email for rule events
   */
  async sendRuleNotificationEmail(
    email: string,
    homeName: string,
    ruleName: string,
    event: string,
  ): Promise<void> {
    const message = `🏠 Home: ${homeName}\n📋 Rule: ${ruleName}\n\n💬 ${event}`;
    const subject = `🔔 Domotic AI - Rule: ${ruleName}`;
    const html = this.createSimpleEmailHTML(message);

    await this.sendEmail(email, subject, html);
  }

  /**
   * Send a notification email for sensor events
   */
  async sendNotificationEmail(
    email: string,
    homeName: string,
    deviceName: string,
    attributeKey: string,
  ): Promise<void> {
    const message = `🏠 Home: ${homeName}\n📱 Device: ${deviceName}\n\n📈 ${attributeKey} detected`;
    const subject = `🔔 Domotic AI - ${attributeKey} Detected`;
    const html = this.createSimpleEmailHTML(message);

    await this.sendEmail(email, subject, html);
  }

  async sendEmail(to: string, subject: string, html: string) {
    if (!this.transporter) {
      this.logger.error('Email service not initialized');
      return;
    }
    const mailOptions = { from: this.emailUser, to, subject, html };
    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.debug(`Email sent: ${info.response}`);
      return info;
    } catch (error) {
      this.logger.error(`Error sending email: ${error.message}`);
      throw error;
    }
  }

  // =================================================================
  // === EMAIL HTML FORMATTING METHODS                            ===
  // =================================================================

  private createSimpleEmailHTML(message: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Domotic AI - Notify</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 10px; 
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1); overflow: hidden;">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); 
                      color: white; padding: 25px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px; font-weight: bold;">
              🏠 Domotic AI - Notify
            </h1>
          </div>

          <!-- Content -->
          <div style="padding: 25px;">
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 15px 0;">
              <p style="margin: 0; color: #555; line-height: 1.6; font-size: 16px;">
                ${message.replace(/\n/g, '<br>')}
              </p>
            </div>
            
            <!-- Action Button -->
            <div style="text-align: center; margin: 25px 0;">
              <a href="${this.baseUrl}" 
                 style="display: inline-block; padding: 12px 30px; background-color: #4CAF50; 
                        color: white; text-decoration: none; border-radius: 6px; font-weight: bold; 
                        font-size: 16px;">
                🏠 Go to Domotic AI
              </a>
            </div>
          </div>

          <!-- Footer -->
          <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
            <p style="margin: 0; color: #666; font-size: 14px;">
              This is an automatic message from the system
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}
