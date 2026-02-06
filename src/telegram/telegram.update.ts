import { On, Start, Update } from '@grammyjs/nestjs';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Context, Keyboard } from 'grammy';
import { TelegramService } from './telegram.service';
import { LinkPhoneByTelegramService } from './link-phone-by-telegram.service';

const MESSAGES = {
  success:
    'Номер успешно привязан. Вернитесь в приложение — доступ будет разблокирован.',
  conflict:
    'Этот номер уже привязан к другому аккаунту. Используйте другой номер или восстановите доступ.',
  not_found:
    'Сначала войдите в приложение через Telegram, затем снова нажмите «Поделиться контактом» здесь.',
  invalid_phone:
    'Не удалось распознать номер. Проверьте формат и попробуйте снова.',
  error:
    'Произошла ошибка. Попробуйте позже или поделитесь контактом снова.',
} as const;

@Update()
@Injectable()
export class TelegramUpdate {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly configService: ConfigService,
    private readonly linkPhoneByTelegramService: LinkPhoneByTelegramService,
  ) {}

  private getPhoneNumberButton(ctx: Context) {
    return new Keyboard()
      .requestContact('Поделиться телефоном')
      .resized();
  }

  @Start()
  async onStart(ctx: Context) {
    const keyboard = this.getPhoneNumberButton(ctx);
    await ctx.reply(
      'Привет! Используй /getphone для получения вашего номера. Или нажмите на кнопку ниже. \n',
      { reply_markup: keyboard },
    );
  }

  @On('message:contact')
  async onContactMessage(ctx: Context) {
    if (!ctx.message?.contact || !ctx.from?.id) {
      return;
    }
    const telegramId = String(ctx.from.id);
    const rawPhone = ctx.message.contact.phone_number;
    const telegramUsername = ctx.from.username ?? undefined;

    const result = await this.linkPhoneByTelegramService.link(
      telegramId,
      rawPhone,
      telegramUsername,
    );
    if (result.ok) {
      await ctx.reply(MESSAGES.success);
      return;
    }

    const message =
      result.reason === 'not_found'
        ? MESSAGES.not_found
        : result.reason === 'conflict'
          ? MESSAGES.conflict
          : result.reason === 'invalid_phone'
            ? MESSAGES.invalid_phone
            : MESSAGES.error;
    await ctx.reply(message);
  }

  @On('message:text')
  async onTextMessage(ctx: Context) {
    if (!ctx.message || !ctx.message.text || !ctx.from?.id) {
      return;
    }

    const text = ctx.message.text;

    if (text === '/getphone') {
      const keyboard = this.getPhoneNumberButton(ctx);
      return await ctx.reply(
        'поделись номером чтобы авторизоваться в выносмусора',
        {
          reply_markup: keyboard,
        }
      );
    }

    // Обычная обработка текста (эхо)
    await ctx.reply(`пока у меня нет других функций кроме поделиться телефоном`);
  }
}
