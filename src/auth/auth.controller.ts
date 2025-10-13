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

interface AuthenticatedRequest extends Request {
  user: AuthResponseDto;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // ==================== EMAIL AUTHENTICATION ====================

  @Post('email/register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Регистрация через email/password',
    description:
      ' Создание нового пользователя с авторизацией через email и пароль. Пароль хешируется перед сохранением в базу данных.',
  })
  async registerWithEmail(
    @Body() registerDto: EmailRegisterDto,
    @Req() req: Request,
  ) {
    const ipAddress =
      req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    return this.authService.registerWithEmail(registerDto, ipAddress);
  }

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

  // ==================== SMS AUTHENTICATION ====================

  @Post('sms/send')
  @ApiOperation({ summary: 'Отправить SMS с кодом верификации' })
  async sendSms(@Body() sendSmsDto: SendSmsDto) {
    return this.authService.sendSms(
      sendSmsDto.phoneNumber, 
      sendSmsDto.isDev, 
      sendSmsDto.channel || 'auto'
    );
  }

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
      verifySmsDto.adToken,
    );
  }

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

  @Post('sms/cleanup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Очистить истекшие коды верификации' })
  async cleanupExpiredCodes() {
    await this.authService.cleanupExpiredCodes();
    return { message: 'Истекшие коды верификации очищены' };
  }

  @Get('sms/balance')
  @ApiOperation({ summary: 'Проверить баланс SMS.RU' })
  @ApiResponse({
    status: 200,
    description: 'Баланс SMS.RU',
    schema: {
      type: 'object',
      properties: {
        balance: { type: 'number', example: 4122.56 },
        message: { type: 'string', example: 'Баланс получен успешно' },
      },
    },
  })
  @ApiResponse({ status: 500, description: 'Ошибка получения баланса' })
  async checkSmsBalance() {
    try {
      const balance = await this.authService.checkSmsBalance();
      return {
        balance,
        message: 'Баланс получен успешно',
      };
    } catch (error) {
      throw new Error(`Ошибка получения баланса: ${error.message}`);
    }
  }

  // ==================== TELEGRAM AUTHENTICATION ====================

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

  // ==================== TOKEN MANAGEMENT ====================

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Обновить access token' })
  async refreshTokens(@Body() refreshTokensDto: RefreshTokensDto) {
    return this.authService.refreshTokens(
      refreshTokensDto.accessToken,
      refreshTokensDto.refreshToken,
    );
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Выход из системы' })
  async logout(@Req() req: AuthenticatedRequest) {
    await this.authService.logout(req.user.user.id);
    return { message: 'Успешный выход' };
  }

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

  // ==================== USER PROFILE ====================

  @ApiBearerAuth('JWT')
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Получить данные текущего пользователя' })
  @ApiResponse({ status: 200, description: 'Данные пользователя' })
  getProfile(@Req() req: AuthenticatedRequest): AuthResponseDto {
    return req.user;
  }
}
