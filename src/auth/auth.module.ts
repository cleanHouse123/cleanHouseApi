import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { AuthService } from './services/auth.service';
import { TokenService } from './services/token.service';
import { TelegramGatewayService } from './services/telegram-gateway.service';
import { SmsRuService } from './services/smsru.service';
import { expiresAccessIn } from 'src/shared/constants';
import { JwtRefreshTokenStrategy } from './strategies/jwt-refresh.strategy';
import { UserModule } from '../user/user.module';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { VerificationCode } from './entities/verification-code.entity';
import { AdTokenModule } from '../ad-tokens/ad-token.module';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    UserModule,
    AdTokenModule,
    TypeOrmModule.forFeature([VerificationCode]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: expiresAccessIn },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    TelegramGatewayService,
    SmsRuService,
    ConfigService,
    JwtStrategy,
    LocalStrategy,
    JwtRefreshTokenStrategy,
    LocalAuthGuard,
  ],
  exports: [AuthService, TokenService, TelegramGatewayService, SmsRuService],
})
export class AuthModule {}
