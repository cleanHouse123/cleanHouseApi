import { On, Start, Update } from '@grammyjs/nestjs';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Context, InlineKeyboard, Keyboard } from 'grammy';
import { TelegramService } from './telegram.service';
import { LinkPhoneByTelegramService } from './link-phone-by-telegram.service';
import { TelegramNotifyGroupService } from './telegram-notify-group.service';
import { TelegramConsentService } from './telegram-consent.service';

const MESSAGES = {
  success:
    'Номер успешно привязан. Вернитесь в приложение — доступ будет разблокирован.',
  conflict:
    'Этот номер уже привязан к другому аккаунту. Используйте другой номер или восстановите доступ.',
  not_found:
    'Сначала войдите в приложение через Telegram, затем снова нажмите «Поделиться контактом» здесь.',
  invalid_phone:
    'Не удалось распознать номер. Проверьте формат и попробуйте снова.',
  own_contact_only:
    'Нужно поделиться именно своим номером через кнопку «Поделиться телефоном».',
  private_chat_only:
    'Для привязки номера откройте личный чат с ботом и нажмите «Поделиться телефоном».',
  app_hint: 'Откройте приложение по кнопке ниже.',
  help: `Что можно сделать в боте:
1) Нажмите «Поделиться телефоном» для привязки аккаунта.
2) Нажмите «Открыть приложение» для входа в приложение.
3) Если не получается войти, сначала авторизуйтесь через Telegram в приложении, затем снова отправьте контакт.`,
  error: 'Произошла ошибка. Попробуйте позже или поделитесь контактом снова.',
  consent_accepted:
    'Спасибо! Согласие принято. Теперь нажмите «Поделиться телефоном», чтобы привязать аккаунт.',
  marketing_accepted:
    'Согласие на рекламную рассылку получено. Отозвать его можно в любой момент — напишите нам или в личном кабинете.',
  consent_required:
    'Чтобы продолжить, сначала подтвердите согласие с документами кнопкой «Принимаю» выше.',
} as const;

/** Редакция документов, с которой соглашается пользователь */
const LEGAL_REVISION = '22 октября 2026 г.';

const LEGAL_PATHS = {
  offer: '/offer',
  personalData: '/consent-personal-data',
  privacy: '/privacy-policy',
  marketing: '/consent-marketing',
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
    private readonly telegramConsentService: TelegramConsentService,
  ) {}

  private getAppUrl(): string {
    const rawUrl =
      this.configService.get<string>('FRONTEND_URL') ||
      this.configService.get<string>('WEB_APP_URL') ||
      this.configService.get<string>('BASE_URL') ||
      'http://localhost:5173';

    if (/^https?:\/\//i.test(rawUrl)) {
      return rawUrl;
    }

    return `https://${rawUrl}`;
  }

  private getLegalUrl(path: string): string {
    return `${this.getAppUrl().replace(/\/$/, '')}${path}`;
  }

  /**
   * Сообщение о документах направляется ДО сбора персональных данных
   * (номера телефона), со ссылками на оферту, согласие на обработку ПДн
   * и политику конфиденциальности.
   */
  private getConsentMessage(): string {
    return [
      'Привет! Это сервис «Чисто дома» — вынос мусора от двери.',
      '',
      'Чтобы привязать аккаунт, нам нужен ваш номер телефона.',
      'Нажимая «Принимаю», вы подтверждаете ознакомление и принятие условий Оферты и даёте Согласие на обработку персональных данных в соответствии с Политикой конфиденциальности.',
      '',
      'Вы также можете дать согласие на рекламную рассылку, чтобы узнавать о скидках и акциях — это необязательно.',
      '',
      'Документы доступны по кнопкам ниже.',
    ].join('\n');
  }

  private getConsentInlineKeyboard(): InlineKeyboard {
    return new InlineKeyboard()
      .url('Оферта', this.getLegalUrl(LEGAL_PATHS.offer))
      .row()
      .url(
        'Согласие на обработку ПДн',
        this.getLegalUrl(LEGAL_PATHS.personalData),
      )
      .row()
      .url(
        'Политика конфиденциальности',
        this.getLegalUrl(LEGAL_PATHS.privacy),
      )
      .row()
      .url('Согласие на рекламную рассылку', this.getLegalUrl(LEGAL_PATHS.marketing))
      .row()
      .text('Принимаю', 'legal_accept')
      .text('Принимаю + реклама', 'legal_accept_marketing');
  }

  private async sendConsentMessage(ctx: Context): Promise<void> {
    await ctx.reply(this.getConsentMessage(), {
      reply_markup: this.getConsentInlineKeyboard(),
      link_preview_options: { is_disabled: true },
    });
  }

  private getPhoneNumberButton(ctx: Context) {
    return new Keyboard()
      .requestContact('Поделиться телефоном')
      .row()
      .text('Открыть приложение')
      .text('Помощь')
      .resized()
      .persistent();
  }

  private getOpenAppInlineKeyboard(): InlineKeyboard {
    return new InlineKeyboard().url('Открыть приложение', this.getAppUrl());
  }

  private getActionsInlineKeyboard(): InlineKeyboard {
    return new InlineKeyboard()
      .url('Открыть приложение', this.getAppUrl())
      .text('Помощь', 'help');
  }

  private async sendHelpMessage(ctx: Context): Promise<void> {
    await ctx.reply(MESSAGES.help, {
      reply_markup: this.getPhoneNumberButton(ctx),
    });
    await ctx.reply(MESSAGES.app_hint, {
      reply_markup: this.getActionsInlineKeyboard(),
    });
  }

  @Start()
  async onStart(ctx: Context) {
    const telegramId = ctx.from?.id ? String(ctx.from.id) : null;

    // Телефон запрашиваем только после согласия с документами
    if (telegramId && this.telegramConsentService.has(telegramId)) {
      await ctx.reply('С возвращением! Нажмите «Поделиться телефоном», чтобы привязать аккаунт.', {
        reply_markup: this.getPhoneNumberButton(ctx),
      });
      await ctx.reply(MESSAGES.app_hint, {
        reply_markup: this.getActionsInlineKeyboard(),
      });
      return;
    }

    await this.sendConsentMessage(ctx);
  }

  @On('message:contact')
  async onContactMessage(ctx: Context) {
    if (!ctx.message?.contact || !ctx.from?.id) {
      return;
    }
    const keyboard = this.getPhoneNumberButton(ctx);

    if (ctx.chat?.type !== 'private') {
      await ctx.reply(MESSAGES.private_chat_only, { reply_markup: keyboard });
      return;
    }

    const telegramId = String(ctx.from.id);

    if (!this.telegramConsentService.has(telegramId)) {
      await this.sendConsentMessage(ctx);
      return;
    }

    if (
      ctx.message.contact.user_id &&
      String(ctx.message.contact.user_id) !== telegramId
    ) {
      await ctx.reply(MESSAGES.own_contact_only, { reply_markup: keyboard });
      return;
    }

    const rawPhone = ctx.message.contact.phone_number;
    const telegramUsername = ctx.from.username ?? undefined;

    const result = await this.linkPhoneByTelegramService.link(
      telegramId,
      rawPhone,
      telegramUsername,
    );
    if (result.ok) {
      await this.telegramConsentService.persist(telegramId, LEGAL_REVISION);
      await ctx.reply(MESSAGES.success, { reply_markup: keyboard });
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
    await ctx.reply(message, { reply_markup: keyboard });
  }

  @On('message:text')
  async onTextMessage(ctx: Context) {
    if (!ctx.message || !ctx.message.text || !ctx.from?.id) {
      return;
    }
    const keyboard = this.getPhoneNumberButton(ctx);

    const text = ctx.message.text;

    if (text === '/getphone') {
      if (!this.telegramConsentService.has(String(ctx.from.id))) {
        await this.sendConsentMessage(ctx);
        return;
      }
      return await ctx.reply(
        'поделись номером чтобы авторизоваться в выносмусора',
        {
          reply_markup: keyboard,
        },
      );
    }

    if (text === '/help' || text === 'Помощь') {
      await this.sendHelpMessage(ctx);
      return;
    }

    if (text === 'Открыть приложение') {
      await ctx.reply(MESSAGES.app_hint, {
        reply_markup: this.getOpenAppInlineKeyboard(),
      });
      return;
    }

    // Обычная обработка текста (эхо)
    if (!this.telegramConsentService.has(String(ctx.from.id))) {
      await this.sendConsentMessage(ctx);
      return;
    }

    await ctx.reply(
      `пока у меня нет других функций кроме поделиться телефоном`,
      {
        reply_markup: keyboard,
      },
    );
  }

  @On('callback_query:data')
  async onCallbackQuery(ctx: Context) {
    const data = ctx.callbackQuery?.data;
    if (!data) {
      return;
    }

    if (data === 'help') {
      await ctx.answerCallbackQuery();
      await this.sendHelpMessage(ctx);
      return;
    }

    if (data === 'legal_accept' || data === 'legal_accept_marketing') {
      const telegramId = ctx.from?.id ? String(ctx.from.id) : null;
      if (!telegramId) {
        await ctx.answerCallbackQuery();
        return;
      }

      await this.telegramConsentService.accept(telegramId, LEGAL_REVISION);
      if (data === 'legal_accept_marketing') {
        await this.telegramConsentService.acceptMarketing(
          telegramId,
          LEGAL_REVISION,
        );
      }

      await ctx.answerCallbackQuery({ text: 'Согласие принято' });
      await ctx.reply(MESSAGES.consent_accepted, {
        reply_markup: this.getPhoneNumberButton(ctx),
      });
      if (data === 'legal_accept_marketing') {
        await ctx.reply(MESSAGES.marketing_accepted);
      }
      await ctx.reply(MESSAGES.app_hint, {
        reply_markup: this.getActionsInlineKeyboard(),
      });
      return;
    }

    await ctx.answerCallbackQuery();
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
