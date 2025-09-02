import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { compare, hash } from 'bcrypt';
import { TokenService } from './token.service';
import { UserService } from '../../user/user.service';
import { User } from '../../user/entities/user.entity';
import { UserRole } from '../../shared/types/user.role';
import { AuthResponseDto } from '../dto/auth-response.dto';
import { SmsService } from './sms.service';
import { ConfigService } from '@nestjs/config';
import { EmailRegisterDto } from '../dto/email-register.dto';
import { EmailLoginDto } from '../dto/email-login.dto';
import { CreateUserDto } from '../../user/dto/create-user.dto';

@Injectable()
export class AuthService {
  constructor(
    private tokenService: TokenService,
    private userService: UserService,
    private smsService: SmsService,
    private configService: ConfigService,
  ) {}

  // Универсальная авторизация через SMS
  async authenticateWithSms(
    phone: string,
    code: string,
    ipAddress?: string,
  ): Promise<AuthResponseDto> {
    // Проверка SMS кода
    const verificationResult = await this.smsService.verifyCode(phone, code);
    if (!verificationResult.success) {
      throw new UnauthorizedException(verificationResult.message);
    }

    // Получаем отформатированный номер из SMS сервиса
    const formattedPhone = this.smsService.formatPhoneNumber(phone);

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

  async sendSms(phone: string): Promise<{ message: string }> {
    const result = await this.smsService.sendVerificationCode(phone);
    return { message: result.message };
  }

  async cleanupExpiredCodes(): Promise<void> {
    await this.smsService.cleanupExpiredCodes();
  }

  async getVerificationCode(phone: string): Promise<{ code: string } | null> {
    return await this.smsService.getVerificationCode(phone);
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
      role: UserRole.ADMIN
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
}
