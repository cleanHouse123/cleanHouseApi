import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegramUpdate } from './telegram.update';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestjsGrammyModule } from '@grammyjs/nestjs';
import { TelegramService } from './telegram.service';
import { LinkPhoneByTelegramService } from './link-phone-by-telegram.service';
import { TelegramNotifyGroupService } from './telegram-notify-group.service';
import { UserModule } from '../user/user.module';
import { TelegramNotifyGroup } from './entities/telegram-notify-group.entity';
import type { BotConfig, Context } from 'grammy';

function getTelegramBotInfo(
  token: string,
  rawUsername?: string,
): NonNullable<BotConfig<Context>['botInfo']> {
  const id = Number(token.split(':')[0]);

  if (!Number.isSafeInteger(id)) {
    throw new Error('Invalid TELEGRAM_BOT_TOKEN: bot id is missing');
  }

  const username = rawUsername?.replace(/^@/, '') || 'cleanhouse_bot';

  return {
    id,
    is_bot: true,
    first_name: 'CleanHouse Bot',
    username,
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false,
    has_topics_enabled: false,
    allows_users_to_create_topics: false,
    can_manage_bots: false,
    supports_join_request_queries: false,
  } as NonNullable<BotConfig<Context>['botInfo']>;
}

@Module({
  imports: [
    ConfigModule,
    UserModule,
    TypeOrmModule.forFeature([TelegramNotifyGroup]),
    NestjsGrammyModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const token = configService.get<string>('TELEGRAM_BOT_TOKEN') ?? '';

        return {
          token,
          options: {
            botInfo: getTelegramBotInfo(
              token,
              configService.get<string>('TELEGRAM_BOT_USERNAME'),
            ),
          },
          useWebhook:
            configService.get<string>('TELEGRAM_BOT_POLLING_ENABLED') !==
            'true',
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [
    TelegramUpdate,
    TelegramService,
    LinkPhoneByTelegramService,
    TelegramNotifyGroupService,
  ],
  exports: [TelegramService, TelegramNotifyGroupService],
})
export class TelegramModule {}
