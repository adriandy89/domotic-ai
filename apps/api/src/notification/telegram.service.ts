import { CacheService } from '@app/cache';
import { DbService } from '@app/db';
import { translate } from '@app/i18n';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIChatRequest, AiService } from '../ai';
const TelegramBot = require('node-telegram-bot-api');

@Injectable()
export class TelegramService implements OnModuleInit {
  private bot: typeof TelegramBot;
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string;
  private readonly webhookUrl: string;
  private readonly webhookSecret: string;

  constructor(
    private readonly config: ConfigService,
    private readonly dbService: DbService,
    private readonly cacheService: CacheService,
    private readonly aiService: AiService,
  ) {
    this.botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN', '');
    this.webhookUrl = this.config.get<string>('TELEGRAM_WEBHOOK_URL', '');
    this.webhookSecret = this.config.get<string>('TELEGRAM_WEBHOOK_SECRET', '');
  }

  async onModuleInit() {
    if (!this.botToken || !this.webhookUrl) {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN or TELEGRAM_WEBHOOK_URL is not configured. Telegram bot disabled.',
      );
      return;
    }
    try {
      // Initialize bot without polling or webhook (only for sending messages)
      this.bot = new TelegramBot(this.botToken, { polling: false });
      await this.setupWebhook();
      this.logger.log('Telegram bot initialized successfully');
    } catch (error: any) {
      this.logger.error(
        `Error initializing Telegram bot: ${error.message}`,
        error.stack,
      );
    }
  }

  private async setupWebhook() {
    try {
      if (this.webhookUrl) {
        // Configure webhook with secret token
        await this.bot.setWebHook(this.webhookUrl, {
          secret_token: this.webhookSecret,
        });
        this.logger.log(`Webhook configured at: ${this.webhookUrl}`);
        if (this.webhookSecret) {
          this.logger.log('Webhook secret token configured successfully');
        }
      } else {
        this.logger.warn(
          'TELEGRAM_WEBHOOK_URL not configured. Webhook not set.',
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Error configuring webhook: ${error.message}`,
        error.stack,
      );
    }
  }

  getBotLink() {
    return this.config.get<string>('TELEGRAM_BOT_LINK', '');
  }

  async generateVerificationCode(userId: string): Promise<string> {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const ttlSeconds = 600; // 10 minutes

    // Clean up existing code for this user if any
    const existingCodeKey = `telegram:user:${userId}:code`;
    const existingCode = await this.cacheService.get<string>(existingCodeKey);

    if (existingCode) {
      await this.cacheService.del(`telegram:code:${existingCode}:user`);
    }

    // Save new code mappings
    await this.cacheService.set(
      `telegram:code:${code}:user`,
      userId,
      ttlSeconds,
    );
    await this.cacheService.set(existingCodeKey, code, ttlSeconds);

    return code;
  }

  async verifyAndLinkAccount(chatId: string, code: string): Promise<boolean> {
    const userId = await this.cacheService.get<string>(
      `telegram:code:${code}:user`,
    );

    if (!userId) {
      await this.bot.sendMessage(
        chatId,
        translate('telegram.bot.invalidCode'),
        { parse_mode: 'HTML' },
      );
      return false;
    }

    try {
      const linkedUser = await this.dbService.user.update({
        where: { id: userId },
        data: { telegram_chat_id: chatId },
        select: { language: true },
      });

      // Cleanup cache
      await this.cacheService.del(`telegram:code:${code}:user`);
      await this.cacheService.del(`telegram:user:${userId}:code`);

      await this.bot.sendMessage(
        chatId,
        translate('telegram.bot.linkedSuccess', linkedUser.language),
        { parse_mode: 'HTML' },
      );
      return true;
    } catch (error: any) {
      this.logger.error(`Error linking account: ${error.message}`, error.stack);
      await this.bot.sendMessage(chatId, translate('telegram.bot.linkError'), {
        parse_mode: 'HTML',
      });
      return false;
    }
  }

  async sendMessage(
    chatId: string,
    message: string,
    replyToMessageId?: number,
    useMarkdown: boolean = false,
  ): Promise<boolean> {
    if (!this.bot) {
      this.logger.warn('Telegram bot not initialized. Cannot send message.');
      return false;
    }

    try {
      // Clean message for Telegram (skip cleaning if using Markdown)
      const cleanedMessage = useMarkdown
        ? message
        : this.cleanMessageForTelegram(message);

      // Split long messages into chunks (Telegram has a 4096 character limit)
      const MAX_LENGTH = 4000;

      const messageOptions: any = {
        parse_mode: useMarkdown ? 'Markdown' : 'HTML',
        disable_web_page_preview: true,
      };

      // Add reply_to_message_id if provided
      if (replyToMessageId) {
        messageOptions.reply_to_message_id = replyToMessageId;
      }

      if (cleanedMessage.length <= MAX_LENGTH) {
        await this.bot.sendMessage(chatId, cleanedMessage, messageOptions);
      } else {
        const chunks: string[] = [];
        for (let i = 0; i < cleanedMessage.length; i += MAX_LENGTH) {
          chunks.push(cleanedMessage.substring(i, i + MAX_LENGTH));
        }

        for (let i = 0; i < chunks.length; i++) {
          const prefix =
            chunks.length > 1
              ? useMarkdown
                ? `*Part ${i + 1}/${chunks.length}:*\n\n`
                : `<b>Part ${i + 1}/${chunks.length}:</b>\n\n`
              : '';
          const chunkOptions =
            i === 0
              ? messageOptions
              : {
                  parse_mode: useMarkdown ? 'Markdown' : 'HTML',
                  disable_web_page_preview: true,
                };

          await this.bot.sendMessage(chatId, prefix + chunks[i], chunkOptions);

          if (i < chunks.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
      }

      return true;
    } catch (error: any) {
      if (error.response?.statusCode === 403) {
        this.logger.warn(
          `User blocked the bot (chatId: ${chatId}). Unlinking...`,
        );
        await this.dbService.user.updateMany({
          where: { telegram_chat_id: chatId },
          data: { telegram_chat_id: null },
        });
      } else {
        this.logger.error(
          `Error sending Telegram message to chatId ${chatId}: ${error.message}`,
          error.stack,
        );
      }
      return false;
    }
  }

  async sendLocation(
    chatId: string,
    latitude: number,
    longitude: number,
  ): Promise<number | null> {
    if (!this.bot) {
      this.logger.warn('Telegram bot not initialized. Cannot send location.');
      return null;
    }

    try {
      const result = await this.bot.sendLocation(chatId, latitude, longitude, {
        disable_notification: true, // Send silently
      });
      this.logger.debug(
        `Location sent successfully to chatId: ${chatId}, message_id: ${result.message_id}`,
      );
      return result.message_id;
    } catch (error: any) {
      if (error.response?.statusCode === 403) {
        this.logger.warn(
          `User blocked the bot (chatId: ${chatId}). Unlinking...`,
        );
        await this.dbService.user.updateMany({
          where: { telegram_chat_id: chatId },
          data: { telegram_chat_id: null },
        });
      } else {
        this.logger.error(
          `Error sending Telegram location to chatId ${chatId}: ${error.message}`,
          error.stack,
        );
      }
      return null;
    }
  }

  private cleanMessageForTelegram(message: string): string {
    // Check if message contains valid Telegram HTML tags
    const hasValidHTML =
      /<(b|strong|i|em|u|ins|s|strike|del|code|pre|a)(\s[^>]*)?>.*?<\/(b|strong|i|em|u|ins|s|strike|del|code|pre|a)>/i.test(
        message,
      );

    if (hasValidHTML) {
      // Message already has HTML formatting, just clean up line breaks
      return message
        .replace(/\n{3,}/g, '\n\n') // Reduce multiple line breaks
        .trim();
    }

    // Legacy cleaning for plain text messages
    return message
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/&lt;br&gt;/g, '\n') // Convert <br> to line breaks
      .replace(/&lt;hr&gt;/g, '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n') // Convert <hr> to line
      .replace(/&lt;\/?\w+&gt;/g, '') // Remove all other HTML tags
      .replace(/\n{3,}/g, '\n\n') // Reduce multiple line breaks
      .trim();
  }

  // Process webhook updates
  async processWebhookUpdate(update: any, secretToken: string) {
    this.logger.debug('Processing webhook update:', JSON.stringify(update));
    try {
      if (!this.webhookSecret || !secretToken) {
        this.logger.warn(
          'TELEGRAM_WEBHOOK_SECRET is not configured. Webhook not set.',
        );
        return { success: false, error: 'Webhook not set' };
      }
      // Validate secret token if configured
      if (this.webhookSecret && secretToken !== this.webhookSecret) {
        this.logger.warn('Invalid webhook secret token');
        return { success: false, error: 'Invalid secret token' };
      }

      if (update.message) {
        await this.handleMessage(update.message);
      }
    } catch (error: any) {
      this.logger.error(
        `Error processing update: ${error.message}`,
        error.stack,
      );
    }
  }

  private async handleMessage(message: any) {
    const chatId = message.chat.id;
    const text = message.text;

    if (text === '/start') {
      await this.bot.sendMessage(chatId, translate('telegram.bot.start'), {
        parse_mode: 'HTML',
      });
    } else if (text?.startsWith('/verify ')) {
      const code = text.substring(8); // Remove '/verify '
      await this.verifyAndLinkAccount(chatId.toString(), code);
    } else if (!text?.startsWith('/')) {
      // Normal message (not a command)
      const user = await this.dbService.user.findFirst({
        where: { telegram_chat_id: chatId.toString() },
        select: {
          id: true,
          name: true,
          email: true,
          language: true,
          organization: {
            select: { attributes: true },
          },
        },
      });
      if (user) {
        if (user.organization?.attributes?.['ai']?.enabled) {
          const checkMsgInProgress = await this.cacheService.setnx(
            `ai:in_progress:${user.id}`,
            '1',
            60,
          );
          if (!checkMsgInProgress) {
            await this.bot.sendMessage(
              chatId,
              translate('telegram.bot.aiInProgress', user.language),
            );
            return;
          }

          const request: AIChatRequest = {
            userId: user.id,
            message: text,
            conversationId: user.id,
          };

          this.logger.log(
            `User ${user.id} sent message: "${text.substring(0, 50)}..."`,
          );

          const response = await this.aiService.chat(request);

          await this.cacheService.del(`ai:in_progress:${user.id}`);

          await this.bot.sendMessage(
            chatId,
            response.response || 'No response',
            { parse_mode: 'HTML' },
          );
        } else {
          await this.bot.sendMessage(
            chatId,
            translate('telegram.bot.accountLinked', user.language, {
              name: user.name || user.email,
            }),
            { parse_mode: 'HTML' },
          );
        }
      } else {
        await this.bot.sendMessage(
          chatId,
          translate('telegram.bot.notLinked'),
          { parse_mode: 'HTML' },
        );
      }
    }
  }
}
