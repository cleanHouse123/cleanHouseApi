import { Module } from '@nestjs/common';
import { TelegramUpdate } from './telegram.update';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestjsGrammyModule } from '@grammyjs/nestjs';
import { TelegramService } from './telegram.service';

@Module({
  imports: [
    ConfigModule,
    NestjsGrammyModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        token: configService.get<string>('TELEGRAM_BOT_TOKEN') ?? '',
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [TelegramUpdate, TelegramService],
})
export class TelegramModule {}
