import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { compare, hash } from 'bcrypt';
import { TokenService } from './token.service';
import { UserService } from '../../user/user.service';
import { User } from '../../user/entities/user.entity';
import { UserRole } from '../../shared/types/user.role';
import { AuthResponseDto } from '../dto/auth-response.dto';
import { TelegramGatewayService } from './telegram-gateway.service';
import { SmsRuService } from '../../sms/services/smsru.service';
import { SmsProviderService } from '../../sms/services/sms-provider.service';
import { ConfigService } from '@nestjs/config';
import { EmailRegisterDto } from '../dto/email-register.dto';
import { EmailLoginDto } from '../dto/email-login.dto';
import { CreateUserDto } from '../../user/dto/create-user.dto';
import { TelegramSendCodeDto } from '../dto/telegram-send-code.dto';
import { TelegramVerifyCodeDto } from '../dto/telegram-verify-code.dto';
import { VerificationCode } from '../entities/verification-code.entity';
import { AdTokenService } from '../../ad-tokens/ad-token.service';

@Injectable()
export class AuthService {
  constructor(
    private tokenService: TokenService,
    private userService: UserService,
    private telegramGatewayService: TelegramGatewayService,
    private smsRuService: SmsRuService,
    private smsProviderService: SmsProviderService,
    private configService: ConfigService,
    private adTokenService: AdTokenService,
    @InjectRepository(VerificationCode)
    private verificationCodeRepository: Repository<VerificationCode>,
  ) {}

  // Универсальная авторизация через SMS.RU
  async authenticateWithSms(
    phone: string,
    code: string,
    ipAddress?: string,
    adToken?: string,
  ): Promise<AuthResponseDto> {
    // Проверка кода через SMS.RU
    const verificationResult = await this.verifyCode(phone, code);
    if (!verificationResult.success) {
      throw new UnauthorizedException(verificationResult.message);
    }

    // Форматируем номер телефона
    const formattedPhone = this.formatPhoneNumber(phone);

    let user = await this.userService.findByPhone(formattedPhone);

    if (!user) {
      const createUserData: CreateUserDto = {
        phone: formattedPhone,
        name: `User_${formattedPhone.slice(-4)}`,
        isPhoneVerified: true,
        role: UserRole.CUSTOMER,
      };

      if (adToken) {
        createUserData.adToken = adToken;
      }

      user = await this.userService.create(createUserData);
    } else {
      // Обновляем статус верификации
      await this.userService.updatePhoneVerification(user.id, true);
    }

    // Обновляем информацию о входе
    if (ipAddress) {
      await this.userService.updateLastLogin(user.id);
    }

    return this.generateAuthTokens(user);
  }

  async refreshTokens(
    accessToken: string,
    refreshToken: string,
  ): Promise<AuthResponseDto> {
    try {
      try {
        await this.tokenService.verifyAccessToken(accessToken);
      } catch {
        // Access token может быть истекшим, это нормально для refresh
      }

      const payload = await this.tokenService.verifyRefreshToken(refreshToken);
      const user = await this.userService.findById(payload.userId);

      if (!user) {
        throw new UnauthorizedException('Пользователь не найден');
      }

      // Проверяем, что refresh token совпадает с сохраненным в базе
      if (!user.refreshTokenHash) {
        throw new UnauthorizedException('Refresh token не найден в базе');
      }

      const isTokenValid = await compare(refreshToken, user.refreshTokenHash);
      if (!isTokenValid) {
        throw new UnauthorizedException('Refresh token недействителен');
      }

      return this.generateAuthTokens(user);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Недействительный refresh token');
    }
  }

  async logout(userId: string): Promise<void> {
    await this.userService.invalidateRefreshToken(userId);
  }

  async revokeAllTokens(userId: string): Promise<void> {
    await this.userService.invalidateRefreshToken(userId);
  }

  async validateRefreshToken(refreshToken: string): Promise<boolean> {
    try {
      const payload = await this.tokenService.verifyRefreshToken(refreshToken);
      const user = await this.userService.findById(payload.userId);

      if (!user || !user.refreshTokenHash) {
        return false;
      }

      return await compare(refreshToken, user.refreshTokenHash);
    } catch {
      return false;
    }
  }

  async sendSms(
    phone: string,
    isDev?: boolean,
    channel: 'whatsapp' | 'sms' | 'auto' = 'auto',
  ): Promise<{ message: string; code?: string; channel?: string }> {
    try {
      // Генерируем код верификации
      const code = this.generateVerificationCode();

      if (isDev) {
        // В режиме разработки сохраняем код и возвращаем его
        await this.saveVerificationCode(phone, code);

        return {
          message: 'Код верификации для разработки (сообщение не отправлено)',
          code: code, // Возвращаем код для разработки
        };
      }

      // Отправляем через новый SMS провайдер (WhatsApp с fallback на SMS)
      const result = await this.smsProviderService.sendVerificationCode(phone, code, channel);

      if (result.success) {
        // Сохраняем код в базе данных для проверки
        await this.saveVerificationCode(phone, code);

        return {
          message: result.message,
          channel: result.channel,
        };
      } else {
        throw new Error(result.error || 'Не удалось отправить сообщение');
      }
    } catch (error) {
      throw new Error(`Ошибка отправки сообщения: ${error.message}`);
    }
  }

  async cleanupExpiredCodes(): Promise<void> {
    await this.cleanupExpiredVerificationCodes();
  }

  async checkSmsBalance(): Promise<number> {
    return this.smsRuService.checkBalance();
  }

  async getVerificationCode(phone: string): Promise<{ code: string } | null> {
    // В моковой версии не возвращаем код из базы для безопасности
    return null;
  }

  private formatPhoneNumber(phoneNumber: string): string {
    // Убираем все символы кроме цифр
    const digits = phoneNumber.replace(/\D/g, '');

    // Если номер начинается с 8, заменяем на +7
    if (digits.startsWith('8') && digits.length === 11) {
      return '+7' + digits.substring(1);
    }

    // Если номер начинается с 7, добавляем +
    if (digits.startsWith('7') && digits.length === 11) {
      return '+' + digits;
    }

    // Если номер уже в международном формате
    if (digits.startsWith('7') && digits.length === 10) {
      return '+7' + digits;
    }

    // Возвращаем как есть, если уже в правильном формате
    return phoneNumber.startsWith('+') ? phoneNumber : '+' + digits;
  }

  private async generateAuthTokens(user: User): Promise<AuthResponseDto> {
    const accessToken = await this.tokenService.generateAccessToken(
      user.id,
      user.name,
    );
    const refreshToken = await this.tokenService.generateRefreshToken(
      user.id,
      user.name,
    );

    const refreshTokenHash = await hash(refreshToken, 10);
    await this.userService.updateRefreshToken(user.id, refreshTokenHash);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
      },
    };
  }

  async validateUserPassword(hash_password: string, password: string) {
    return compare(password, hash_password);
  }

  // Регистрация через email/password
  async registerWithEmail(
    registerDto: EmailRegisterDto,
    ipAddress?: string,
  ): Promise<AuthResponseDto> {
    const { email, password, name } = registerDto;

    // Проверяем, что пользователь с таким email не существует
    const existingUser = await this.userService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    // Хешируем пароль
    const hashedPassword = await hash(password, 10);

    const createUserData: CreateUserDto = {
      name,
      email,
      hash_password: hashedPassword,
      phone: `email_${email}`,
      isEmailVerified: false,
      role: UserRole.ADMIN,
    };

    const user = await this.userService.create(createUserData);

    if (ipAddress) {
      await this.userService.updateLastLogin(user.id);
    }

    return this.generateAuthTokens(user);
  }

  async authenticateWithEmail(
    loginDto: EmailLoginDto,
    ipAddress?: string,
  ): Promise<AuthResponseDto> {
    const { email, password } = loginDto;

    const user = await this.userService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Неверные учетные данные');
    }

    if (!user.hash_password) {
      throw new UnauthorizedException(
        'Пароль не установлен для данного пользователя',
      );
    }

    const isPasswordValid = await compare(password, user.hash_password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Неверные учетные данные');
    }

    if (ipAddress) {
      await this.userService.updateLastLogin(user.id);
    }

    return this.generateAuthTokens(user);
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.userService.findByEmail(email);
    if (!user) {
      return null;
    }

    if (!user.hash_password) {
      return null;
    }

    const isPasswordValid = await compare(password, user.hash_password);
    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  // Telegram Gateway авторизация
  async sendTelegramCode(sendCodeDto: TelegramSendCodeDto): Promise<{
    success: boolean;
    message: string;
    requestId?: string;
    cost?: number;
  }> {
    try {
      // Форматируем номер телефона
      const formattedPhone = this.telegramGatewayService.formatPhoneNumber(
        sendCodeDto.phoneNumber,
      );

      // Проверяем валидность номера
      if (!this.telegramGatewayService.validatePhoneNumber(formattedPhone)) {
        return {
          success: false,
          message: 'Неверный формат номера телефона',
        };
      }

      // Проверяем возможность отправки (опционально)
      let requestId: string | undefined;
      try {
        const checkResult =
          await this.telegramGatewayService.checkSendAbility(formattedPhone);
        requestId = checkResult.request_id;
      } catch (error) {
        // Если проверка не удалась, продолжаем без requestId
        console.warn('Не удалось проверить возможность отправки:', error);
      }

      // Отправляем код верификации
      const result = await this.telegramGatewayService.sendVerificationMessage(
        formattedPhone,
        {
          requestId,
          code: sendCodeDto.code,
          codeLength: sendCodeDto.codeLength || 6,
          callbackUrl: sendCodeDto.callbackUrl,
          ttl: sendCodeDto.ttl || 300, // 5 минут по умолчанию
        },
      );

      return {
        success: true,
        message: 'Код отправлен через Telegram',
        requestId: result.request_id,
        cost: result.request_cost,
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error ? error.message : 'Ошибка отправки кода',
      };
    }
  }

  async authenticateWithTelegram(
    verifyCodeDto: TelegramVerifyCodeDto,
    ipAddress?: string,
  ): Promise<AuthResponseDto> {
    try {
      // Форматируем номер телефона
      const formattedPhone = this.telegramGatewayService.formatPhoneNumber(
        verifyCodeDto.phoneNumber,
      );

      // Проверяем код через Telegram Gateway API
      if (verifyCodeDto.requestId) {
        const verificationResult =
          await this.telegramGatewayService.checkVerificationStatus(
            verifyCodeDto.requestId,
            verifyCodeDto.code,
          );

        if (verificationResult.verification_status?.status !== 'code_valid') {
          throw new UnauthorizedException('Неверный код верификации');
        }
      } else {
        // Если нет requestId, проверяем через моковую авторизацию
        const verificationResult = await this.verifyCode(
          formattedPhone,
          verifyCodeDto.code,
        );
        if (!verificationResult.success) {
          throw new UnauthorizedException(verificationResult.message);
        }
      }

      // Ищем или создаем пользователя
      let user = await this.userService.findByPhone(formattedPhone);

      if (!user) {
        user = await this.userService.create({
          phone: formattedPhone,
          name: `User_${formattedPhone.slice(-4)}`,
          isPhoneVerified: true,
          role: UserRole.CUSTOMER,
        });
      } else {
        // Обновляем статус верификации
        await this.userService.updatePhoneVerification(user.id, true);
      }

      // Обновляем информацию о входе
      if (ipAddress) {
        await this.userService.updateLastLogin(user.id);
      }

      return this.generateAuthTokens(user);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException(
        error instanceof Error ? error.message : 'Ошибка авторизации',
      );
    }
  }

  async checkTelegramSendAbility(phoneNumber: string): Promise<{
    success: boolean;
    message: string;
    requestId?: string;
    cost?: number;
  }> {
    try {
      const formattedPhone =
        this.telegramGatewayService.formatPhoneNumber(phoneNumber);

      if (!this.telegramGatewayService.validatePhoneNumber(formattedPhone)) {
        return {
          success: false,
          message: 'Неверный формат номера телефона',
        };
      }

      const result =
        await this.telegramGatewayService.checkSendAbility(formattedPhone);

      return {
        success: true,
        message: 'Проверка возможности отправки выполнена',
        requestId: result.request_id,
        cost: result.request_cost,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Ошибка проверки',
      };
    }
  }

  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async verifyCode(
    phone: string,
    code: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const verificationCode = await this.verificationCodeRepository.findOne({
        where: { phoneNumber: phone, code, isUsed: false },
      });

      if (!verificationCode) {
        return { success: false, message: 'Неверный код верификации' };
      }

      if (verificationCode.expiresAt < new Date()) {
        return { success: false, message: 'Код верификации истек' };
      }

      // Помечаем код как использованный
      verificationCode.isUsed = true;
      await this.verificationCodeRepository.save(verificationCode);

      return { success: true, message: 'Код верификации подтвержден' };
    } catch (error) {
      return { success: false, message: 'Ошибка проверки кода' };
    }
  }

  private async saveVerificationCode(
    phone: string,
    code: string,
  ): Promise<void> {
    try {
      // Удаляем старые коды для этого номера
      await this.verificationCodeRepository.delete({ phoneNumber: phone });

      // Создаем новый код
      const verificationCode = this.verificationCodeRepository.create({
        phoneNumber: phone,
        code,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 минут
      });

      await this.verificationCodeRepository.save(verificationCode);
    } catch (error) {
      throw error;
    }
  }

  private async cleanupExpiredVerificationCodes(): Promise<void> {
    try {
      const expiredCodes = await this.verificationCodeRepository
        .createQueryBuilder('verificationCode')
        .where('verificationCode.expiresAt < :now', { now: new Date() })
        .getMany();

      if (expiredCodes.length > 0) {
        await this.verificationCodeRepository.remove(expiredCodes);
      }
    } catch (error) {
      throw error;
    }
  }
}
