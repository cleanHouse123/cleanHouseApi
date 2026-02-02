import { Module } from '@nestjs/common';
import { TelegramUpdate } from './telegram.update';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestjsGrammyModule } from '@grammyjs/nestjs';
import { TelegramService } from './telegram.service';
import { LinkPhoneByTelegramService } from './link-phone-by-telegram.service';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    ConfigModule,
    UserModule,
    NestjsGrammyModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        token: configService.get<string>('TELEGRAM_BOT_TOKEN') ?? '',
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [TelegramUpdate, TelegramService, LinkPhoneByTelegramService],
})
export class TelegramModule {}
