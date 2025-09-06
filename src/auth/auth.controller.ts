import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AuthResponseDto } from './dto/auth-response.dto';
import { EmailLoginDto } from './dto/email-login.dto';
import { EmailRegisterDto } from './dto/email-register.dto';
import { RefreshTokensDto } from './dto/refresh-tokens.dto';
import { SendSmsDto } from './dto/send-sms.dto';
import { VerifySmsDto } from './dto/verify-sms.dto';
import { TelegramSendCodeDto } from './dto/telegram-send-code.dto';
import { TelegramVerifyCodeDto } from './dto/telegram-verify-code.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthService } from './services/auth.service';
// import { SmsService } from './services/sms.service';

interface AuthenticatedRequest extends Request {
  user: AuthResponseDto;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    // private smsService: SmsService,
  ) {}

  @ApiTags('Email Authentication')
  @Post('email/register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Регистрация через email/password',
    description:
      'Создание нового пользователя с авторизацией через email и пароль. Пароль хешируется перед сохранением в базу данных.',
  })
  async registerWithEmail(
    @Body() registerDto: EmailRegisterDto,
    @Req() req: Request,
  ) {
    const ipAddress =
      req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    return this.authService.registerWithEmail(registerDto, ipAddress);
  }

  @ApiTags('Email Authentication')
  @Post('email/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Авторизация через email/password',
    description:
      'Вход в систему с использованием email и пароля. Возвращает JWT токены для дальнейшей авторизации.',
  })
  async loginWithEmail(@Body() loginDto: EmailLoginDto, @Req() req: Request) {
    const ipAddress =
      req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    return this.authService.authenticateWithEmail(loginDto, ipAddress);
  }

  @ApiTags('SMS Authentication')
  @Post('sms/send')
  @ApiOperation({ summary: 'Отправить SMS с кодом верификации' })
  async sendSms(@Body() sendSmsDto: SendSmsDto) {
    return this.authService.sendSms(sendSmsDto.phoneNumber);
  }

  @ApiTags('SMS Authentication')
  @Post('sms/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Проверить SMS код и авторизоваться' })
  async verifySms(@Body() verifySmsDto: VerifySmsDto, @Req() req: Request) {
    const ipAddress =
      req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    return this.authService.authenticateWithSms(
      verifySmsDto.phoneNumber,
      verifySmsDto.code,
      ipAddress,
    );
  }

  @ApiTags('SMS Authentication')
  @Get('sms/verification-code/:phone')
  @ApiOperation({
    summary: 'Получить код верификации (только для тестирования)',
  })
  async getVerificationCode(@Param('phone') phone: string) {
    const result = await this.authService.getVerificationCode(phone);
    if (!result) {
      throw new UnauthorizedException('Код верификации не найден или истек');
    }
    return result;
  }

  @ApiTags('SMS Authentication')
  @Post('sms/cleanup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Очистить истекшие коды верификации' })
  async cleanupExpiredCodes() {
    await this.authService.cleanupExpiredCodes();
    return { message: 'Истекшие коды верификации очищены' };
  }

  @ApiTags('SMS Authentication')
  @Get('sms/balance')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Получить баланс SMS.RU' })
  async getBalance() {
    // return await this.smsService.getBalance();
    return { message: 'Баланс SMS.RU не доступен' };
  }

  @ApiTags('Token Management')
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Обновить access token' })
  async refreshTokens(@Body() refreshTokensDto: RefreshTokensDto) {
    return this.authService.refreshTokens(
      refreshTokensDto.accessToken,
      refreshTokensDto.refreshToken,
    );
  }

  @ApiTags('Token Management')
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Выход из системы' })
  async logout(@Req() req: AuthenticatedRequest) {
    await this.authService.logout(req.user.user.id);
    return { message: 'Успешный выход' };
  }

  @ApiTags('Token Management')
  @Post('revoke-all-tokens')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Отозвать все токены пользователя (для безопасности)',
  })
  @ApiResponse({ status: 200, description: 'Все токены отозваны' })
  async revokeAllTokens(@Req() req: AuthenticatedRequest) {
    await this.authService.revokeAllTokens(req.user.user.id);
    return { message: 'Все токены отозваны' };
  }

  @ApiTags('Token Management')
  @Post('validate-refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Проверить валидность refresh token' })
  @ApiResponse({ status: 200, description: 'Token валиден' })
  @ApiResponse({ status: 401, description: 'Token недействителен' })
  async validateRefreshToken(@Body() body: { refreshToken: string }) {
    const isValid = await this.authService.validateRefreshToken(
      body.refreshToken,
    );
    if (!isValid) {
      throw new UnauthorizedException('Refresh token недействителен');
    }
    return { valid: true };
  }

  @ApiTags('Telegram Authentication')
  @Post('telegram/send')
  @ApiOperation({
    summary: 'Отправить код верификации через Telegram Gateway',
    description:
      'Отправляет код верификации через Telegram Gateway API. Стоимость: $0.01 за доставленный код.',
  })
  @ApiResponse({ status: 200, description: 'Код отправлен через Telegram' })
  async sendTelegramCode(@Body() sendCodeDto: TelegramSendCodeDto) {
    return this.authService.sendTelegramCode(sendCodeDto);
  }

  @ApiTags('Telegram Authentication')
  @Post('telegram/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Проверить код верификации Telegram и авторизоваться',
    description:
      'Проверяет код верификации через Telegram Gateway API и выполняет авторизацию пользователя.',
  })
  @ApiResponse({
    status: 200,
    description: 'Успешная авторизация через Telegram',
  })
  async verifyTelegramCode(
    @Body() verifyCodeDto: TelegramVerifyCodeDto,
    @Req() req: Request,
  ) {
    const ipAddress =
      req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    return this.authService.authenticateWithTelegram(verifyCodeDto, ipAddress);
  }

  @ApiTags('Telegram Authentication')
  @Post('telegram/check-ability')
  @ApiOperation({
    summary: 'Проверить возможность отправки кода через Telegram',
    description:
      'Проверяет возможность отправки кода верификации на указанный номер через Telegram Gateway.',
  })
  @ApiResponse({
    status: 200,
    description: 'Проверка возможности отправки выполнена',
  })
  async checkTelegramSendAbility(@Body() body: { phoneNumber: string }) {
    return this.authService.checkTelegramSendAbility(body.phoneNumber);
  }

  @ApiTags('User Profile')
  @ApiBearerAuth('JWT')
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Получить данные текущего пользователя' })
  @ApiResponse({ status: 200, description: 'Данные пользователя' })
  getProfile(@Req() req: AuthenticatedRequest): AuthResponseDto {
    return req.user;
  }
}
