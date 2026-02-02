import { On, Start, Update } from '@grammyjs/nestjs';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Context, InlineKeyboard, Keyboard } from 'grammy';
import { TelegramService } from './telegram.service';

@Update()
@Injectable()
export class TelegramUpdate {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly configService: ConfigService,
  ) {}

  private getPhoneNumberButton(ctx: Context) {
    return new Keyboard()
      .requestContact("Поделиться телефоном").resized();
  }

  @Start()
  async onStart(ctx: Context) {

    const keyboard = this.getPhoneNumberButton(ctx);

    await ctx.reply(
      'Привет! Используй /getphone для получения вашего номера. Или нажмите на кнопку ниже. \n',
      {
        reply_markup: keyboard,
      }
    );
  }

  @On('message:contact')
  async onContactMessage(ctx: Context) {
    if (!ctx.message || !ctx.message.contact) {
      return;
    }
    const phone = ctx.message.contact.phone_number;
    const firstName = ctx.message.contact.first_name;

    await ctx.reply(`Спасибо, ${firstName}! Ваш номер: ${phone}`);
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
