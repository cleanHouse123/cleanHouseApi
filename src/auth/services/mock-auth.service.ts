import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VerificationCode } from '../entities/verification-code.entity';

@Injectable()
export class MockAuthService {
  private readonly logger = new Logger(MockAuthService.name);

  constructor(
    @InjectRepository(VerificationCode)
    private verificationCodeRepository: Repository<VerificationCode>,
  ) {}

  /**
   * Генерирует случайный код верификации
   */
  private generateVerificationCode(length: number = 6): string {
    const digits = '0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += digits.charAt(Math.floor(Math.random() * digits.length));
    }
    return result;
  }

  /**
   * Отправляет код верификации (моковая реализация)
   */
  async sendVerificationCode(phoneNumber: string): Promise<{
    success: boolean;
    message: string;
    code?: string;
  }> {
    try {
      // Форматируем номер телефона
      const formattedPhone = this.formatPhoneNumber(phoneNumber);

      //   // Проверяем валидность номера
      //   if (!this.validatePhoneNumber(formattedPhone)) {
      //     return {
      //       success: false,
      //       message: 'Неверный формат номера телефона',
      //     };
      //   }

      // Генерируем код
      const code = this.generateVerificationCode(6);

      // Сохраняем код в базу данных
      const verificationCode = this.verificationCodeRepository.create({
        phoneNumber: formattedPhone,
        code,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 минут
        attempts: 0,
      });

      await this.verificationCodeRepository.save(verificationCode);

      this.logger.log(`Код верификации для ${formattedPhone}: ${code}`);

      return {
        success: true,
        message: 'Код отправлен успешно',
        code, // В реальном приложении код не возвращается
      };
    } catch (error) {
      this.logger.error('Ошибка отправки кода:', error);
      return {
        success: false,
        message: 'Ошибка отправки кода',
      };
    }
  }

  /**
   * Проверяет код верификации
   */
  async verifyCode(
    phoneNumber: string,
    code: string,
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const formattedPhone = this.formatPhoneNumber(phoneNumber);

      // Ищем код в базе данных
      const verificationCode = await this.verificationCodeRepository.findOne({
        where: { phoneNumber: formattedPhone, code },
      });

      if (!verificationCode) {
        return {
          success: false,
          message: 'Неверный код верификации',
        };
      }

      // Проверяем срок действия
      if (verificationCode.expiresAt < new Date()) {
        await this.verificationCodeRepository.remove(verificationCode);
        return {
          success: false,
          message: 'Код верификации истек',
        };
      }

      // Проверяем количество попыток
      if (verificationCode.attempts >= 3) {
        await this.verificationCodeRepository.remove(verificationCode);
        return {
          success: false,
          message: 'Превышено количество попыток ввода кода',
        };
      }

      // Увеличиваем счетчик попыток
      verificationCode.attempts += 1;
      await this.verificationCodeRepository.save(verificationCode);

      // Удаляем использованный код
      await this.verificationCodeRepository.remove(verificationCode);

      return {
        success: true,
        message: 'Код верификации подтвержден',
      };
    } catch (error) {
      this.logger.error('Ошибка проверки кода:', error);
      return {
        success: false,
        message: 'Ошибка проверки кода',
      };
    }
  }

  /**
   * Форматирует номер телефона в международный формат
   */
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

  /**
   * Проверяет валидность номера телефона
   */
  private validatePhoneNumber(phoneNumber: string): boolean {
    // Простая проверка на российские номера
    const russianPhoneRegex = /^\+7[0-9]{10}$/;
    return russianPhoneRegex.test(phoneNumber);
  }

  /**
   * Очищает истекшие коды верификации
   */
  async cleanupExpiredCodes(): Promise<void> {
    try {
      const expiredCodes = await this.verificationCodeRepository
        .createQueryBuilder('verificationCode')
        .where('verificationCode.expiresAt < :now', { now: new Date() })
        .getMany();

      if (expiredCodes.length > 0) {
        await this.verificationCodeRepository.remove(expiredCodes);
        this.logger.log(
          `Удалено ${expiredCodes.length} истекших кодов верификации`,
        );
      }
    } catch (error) {
      this.logger.error('Ошибка очистки истекших кодов:', error);
    }
  }

  async saveVerificationCode(phone: string, code: string): Promise<void> {
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
      this.logger.log(`Код верификации сохранен для номера: ${phone}`);
    } catch (error) {
      this.logger.error('Ошибка сохранения кода верификации:', error);
      throw error;
    }
  }
}
