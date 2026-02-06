import { InjectBot } from '@grammyjs/nestjs';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, Context } from 'grammy';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string;

  constructor(
    @InjectBot() private readonly bot: Bot<Context>,
    private readonly configService: ConfigService,
  ) {
    const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
      throw new Error(
        'TELEGRAM_BOT_TOKEN is not defined in environment variables',
      );
    }
    this.botToken = botToken;
  }

  /**
   * Отправляет текстовое сообщение в указанный чат (chat_id).
   * chatId — числовой ID пользователя/группы или строка (например, -1001234567890 для групп).
   */
  async sendMessage(chatId: string, text: string): Promise<boolean> {
    try {
      const id = chatId.trim();
      if (!id) return false;
      await this.bot.api.sendMessage(id, text);
      return true;
    } catch (err) {
      this.logger.warn(`[sendMessage] Failed to send to ${chatId}: ${err}`);
      return false;
    }
  }
}
