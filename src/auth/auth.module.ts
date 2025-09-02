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
import { SmsService } from './services/sms.service';
import { expiresAccessIn } from 'src/shared/constants';
import { JwtRefreshTokenStrategy } from './strategies/jwt-refresh.strategy';
import { UserModule } from '../user/user.module';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { VerificationCode } from './entities/verification-code.entity';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    UserModule,
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
    SmsService,
    ConfigService,
    JwtStrategy,
    LocalStrategy,
    JwtRefreshTokenStrategy,
    LocalAuthGuard,
  ],
  exports: [AuthService, TokenService, SmsService],
})
export class AuthModule {}
