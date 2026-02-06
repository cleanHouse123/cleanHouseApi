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

@Module({
  imports: [
    ConfigModule,
    UserModule,
    TypeOrmModule.forFeature([TelegramNotifyGroup]),
    NestjsGrammyModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        token: configService.get<string>('TELEGRAM_BOT_TOKEN') ?? '',
      }),
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
