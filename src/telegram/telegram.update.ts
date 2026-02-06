import { On, Start, Update } from '@grammyjs/nestjs';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Context, Keyboard } from 'grammy';
import { TelegramService } from './telegram.service';
import { LinkPhoneByTelegramService } from './link-phone-by-telegram.service';
import { TelegramNotifyGroupService } from './telegram-notify-group.service';

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

const BOT_IN_STATUSES = ['member', 'administrator', 'restricted'] as const;
const BOT_OUT_STATUSES = ['left', 'kicked'] as const;
const GROUP_CHAT_TYPES = ['group', 'supergroup'] as const;

@Update()
@Injectable()
export class TelegramUpdate {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly configService: ConfigService,
    private readonly linkPhoneByTelegramService: LinkPhoneByTelegramService,
    private readonly telegramNotifyGroupService: TelegramNotifyGroupService,
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

  /**
   * Когда бота добавляют в группу — сохраняем чат для рассылки о новых заказах.
   * Когда бота удаляют из группы — отключаем рассылку в этот чат.
   */
  @On('my_chat_member')
  async onMyChatMember(ctx: Context) {
    const update = ctx.update?.my_chat_member;
    const chat = update?.chat;
    const oldStatus = update?.old_chat_member?.status;
    const newStatus = update?.new_chat_member?.status;
    if (!chat || oldStatus == null || newStatus == null) return;

    const isGroup = GROUP_CHAT_TYPES.some((t) => t === chat.type);
    if (!isGroup) return;

    const chatId = String(chat.id);
    const added =
      BOT_OUT_STATUSES.includes(oldStatus as any) &&
      BOT_IN_STATUSES.includes(newStatus as any);
    const removed =
      BOT_IN_STATUSES.includes(oldStatus as any) &&
      BOT_OUT_STATUSES.includes(newStatus as any);

    if (added) {
      await this.telegramNotifyGroupService.addGroup(
        chatId,
        'title' in chat ? (chat.title as string) : undefined,
      );
      try {
        await ctx.api.sendMessage(
          chat.id,
          '✅ Готово! В эту группу будут приходить уведомления о новых заказах.',
        );
      } catch {
        // игнорируем ошибку отправки приветствия
      }
    } else if (removed) {
      await this.telegramNotifyGroupService.deactivateGroup(chatId);
    }
  }
}
