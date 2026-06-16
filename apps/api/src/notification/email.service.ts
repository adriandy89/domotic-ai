import { translate } from '@app/i18n';
import { resolveLanguage } from '@app/models';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
const nodemailer = require('nodemailer');

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  // --- Configuration Properties ---
  private readonly baseUrl: string;
  private readonly transporter;
  private readonly emailUser: string;
  private readonly emailPass: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>(
      'PUBLIC_APP_URL',
      'http://localhost:3003',
    );
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
    language?: string | null,
  ): Promise<void> {
    const message = translate('email.rule.body', language, {
      homeName,
      ruleName,
      event,
    });
    const subject = translate('email.rule.subject', language, { ruleName });
    const html = this.createEmailHTML({
      title: translate('email.rule.title', language),
      message,
      language,
      accent: '#F59E0B',
      icon: '⚡',
    });

    await this.sendEmail(email, subject, html);
  }

  /**
   * Send a notification email for home connection status changes
   */
  async sendHomeConnectionEmail(
    email: string,
    homeName: string,
    connected: boolean,
    language?: string | null,
  ): Promise<void> {
    const message = translate(
      connected ? 'email.home.bodyConnected' : 'email.home.bodyDisconnected',
      language,
      { homeName },
    );
    const subject = translate(
      connected
        ? 'email.home.subjectConnected'
        : 'email.home.subjectDisconnected',
      language,
      { homeName },
    );
    const html = this.createEmailHTML({
      title: translate(
        connected ? 'email.home.titleConnected' : 'email.home.titleDisconnected',
        language,
      ),
      message,
      language,
      accent: connected ? '#22C55E' : '#EF4444',
      icon: connected ? '🟢' : '🔴',
    });

    await this.sendEmail(email, subject, html);
  }

  /**
   * Send a notification email for sensor events.
   * `attribute` is the already-localized sensor label (e.g. "Contact Closed").
   */
  async sendNotificationEmail(
    email: string,
    homeName: string,
    deviceName: string,
    attribute: string,
    language?: string | null,
  ): Promise<void> {
    const message = translate('email.sensor.body', language, {
      homeName,
      deviceName,
      attribute,
    });
    const subject = translate('email.sensor.subject', language, { attribute });
    const html = this.createEmailHTML({
      title: translate('email.sensor.title', language, { attribute }),
      message,
      language,
      accent: '#3B82F6',
      icon: '📡',
    });

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
    } catch (error: any) {
      this.logger.error(`Error sending email: ${error.message}`);
      throw error;
    }
  }

  // =================================================================
  // === EMAIL HTML FORMATTING METHODS                            ===
  // =================================================================

  /**
   * Render a notification email with a per-type accent banner + icon + title,
   * an accent-bordered message card and an accent CTA. `accent` / `icon` /
   * `title` differ by notification type so each one is visually distinct.
   */
  private createEmailHTML(opts: {
    title: string;
    message: string;
    language?: string | null;
    accent: string;
    icon: string;
  }): string {
    const { title, message, accent, icon } = opts;
    const lang = resolveLanguage(opts.language);
    return `
      <!DOCTYPE html>
      <html lang="${lang}">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${translate('email.chrome.title', opts.language)}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f4f5f7;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 14px;
                    box-shadow: 0 6px 18px rgba(0,0,0,0.08); overflow: hidden;">

          <!-- Accent header (per type) -->
          <div style="background: linear-gradient(135deg, ${accent} 0%, ${accent}cc 100%);
                      color: #ffffff; padding: 28px 24px; text-align: center;">
            <div style="font-size: 40px; line-height: 1; margin-bottom: 8px;">${icon}</div>
            <h1 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.2px;">
              ${title}
            </h1>
          </div>

          <!-- Content -->
          <div style="padding: 24px;">
            <div style="background-color: #f8f9fa; border-left: 4px solid ${accent}; padding: 18px 20px; border-radius: 8px; margin: 8px 0 4px;">
              <p style="margin: 0; color: #444; line-height: 1.7; font-size: 16px;">
                ${message.replace(/\n/g, '<br>')}
              </p>
            </div>

            <!-- Action Button -->
            <div style="text-align: center; margin: 26px 0 8px;">
              <a href="${this.baseUrl}"
                 style="display: inline-block; padding: 12px 32px; background-color: ${accent};
                        color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 700;
                        font-size: 15px;">
                ${translate('email.chrome.cta', opts.language)} &rarr;
              </a>
            </div>
          </div>

          <!-- Footer -->
          <div style="background-color: #f8f9fa; padding: 18px; text-align: center; border-top: 1px solid #eceef1;">
            <p style="margin: 0; color: #8a909a; font-size: 13px;">
              ${translate('email.chrome.footer', opts.language)}
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}
