import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosResponse } from 'axios';
import { normalizePhoneToE164 } from '../../shared/utils/phone-normalizer.util';

export interface WahaResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface WahaCheckExistsResponse {
  numberExists: boolean;
  chatId?: string;
}

@Injectable()
export class WahaService {
  private readonly logger = new Logger(WahaService.name);
  private readonly apiUrl: string;
  private readonly apiToken: string;
  private readonly session: string = 'default';

  constructor(private configService: ConfigService) {
    this.apiUrl =
      this.configService.get<string>('WAHA_API_URL') || 'http://localhost:3001';
    this.apiToken =
      this.configService.get<string>('WAHA_API_TOKEN') ||
      '0C85DAAA24374C408D0143B375233B6F';

    this.logger.log(`WAHA Service инициализирован. API URL: ${this.apiUrl}`);
    this.logger.log(`WAHA API Token настроен: ${this.apiToken ? 'да' : 'нет'}`);
  }

  /**
   * Нормализует номер телефона для WhatsApp
   */
  private normalizePhoneNumber(phoneNumber: string): string {
    const cleaned = phoneNumber.replace(/\s+/g, '').trim();

    // Приводим к E.164 и для WAHA убираем "+"
    try {
      return normalizePhoneToE164(cleaned).replace('+', '');
    } catch {
      // Фолбэк для локальных российских номеров (10-значный/11-значный с 8)
      const digitsOnly = cleaned.replace(/\D/g, '');
      if (!digitsOnly) {
        throw new Error('Пустой номер телефона');
      }
      if (digitsOnly.length === 10) {
        return `7${digitsOnly}`;
      }
      if (digitsOnly.length === 11 && digitsOnly.startsWith('8')) {
        return `7${digitsOnly.substring(1)}`;
      }
      if (digitsOnly.length === 11 && digitsOnly.startsWith('7')) {
        return digitsOnly;
      }
      throw new Error(`Некорректный номер телефона: ${phoneNumber}`);
    }
  }

  private formatAxiosError(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const responseData = error.response?.data;
      return `${error.message}; status=${status ?? 'unknown'}; data=${JSON.stringify(responseData ?? {})}`;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  /**
   * Проверяет, зарегистрирован ли номер в WhatsApp
   * Согласно документации: GET /api/contacts/check-exists?phone=11231231231&session=default
   */
  async checkNumberExists(phoneNumber: string): Promise<boolean> {
    try {
      const normalizedPhone = this.normalizePhoneNumber(phoneNumber);

      this.logger.log(
        `Проверка номера в WhatsApp: ${phoneNumber} -> ${normalizedPhone}`,
      );

      const response: AxiosResponse<WahaCheckExistsResponse> = await axios.get(
        `${this.apiUrl}/api/contacts/check-exists`,
        {
          params: {
            phone: normalizedPhone,
            session: this.session,
          },
          headers: {
            'X-Api-Key': this.apiToken,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 10000,
        },
      );

      const exists = response.data.numberExists;
      const chatId = response.data.chatId;

      this.logger.log(
        `Номер ${normalizedPhone} ${exists ? 'зарегистрирован' : 'не зарегистрирован'} в WhatsApp`,
      );
      if (chatId) {
        this.logger.log(`ChatId для номера ${normalizedPhone}: ${chatId}`);
      }

      return exists;
    } catch (error) {
      this.logger.error(
        `Ошибка при проверке номера в WhatsApp: ${this.formatAxiosError(error)}`,
      );
      throw new Error(
        `Не удалось проверить номер в WhatsApp: ${this.formatAxiosError(error)}`,
      );
    }
  }

  /**
   * Отправляет сообщение через WhatsApp
   * Согласно документации: POST /api/sendText
   */
  async sendMessage(
    phoneNumber: string,
    message: string,
  ): Promise<WahaResponse> {
    try {
      const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
      this.logger.log(
        `Отправка WhatsApp сообщения на номер: ${phoneNumber} -> ${normalizedPhone}`,
      );

      // Сначала проверяем, зарегистрирован ли номер и получаем chatId
      const checkResponse = await this.checkNumberExistsWithChatId(phoneNumber);
      if (!checkResponse.exists) {
        throw new Error('Номер не зарегистрирован в WhatsApp');
      }

      const chatId = checkResponse.chatId || `${normalizedPhone}@c.us`;
      this.logger.log(`Отправка сообщения в чат: ${chatId}`);

      const response: AxiosResponse<WahaResponse> = await axios.post(
        `${this.apiUrl}/api/sendText`,
        {
          chatId: chatId,
          text: message,
          session: this.session,
        },
        {
          headers: {
            'X-Api-Key': this.apiToken,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 15000,
        },
      );

      if (response.data.success) {
        this.logger.log(
          `WhatsApp сообщение успешно отправлено в чат: ${chatId}`,
        );
      } else {
        this.logger.error(
          `Ошибка отправки WhatsApp сообщения: ${response.data.error}`,
        );
      }

      return response.data;
    } catch (error) {
      this.logger.error(
        `Ошибка при отправке WhatsApp сообщения: ${this.formatAxiosError(error)}`,
      );
      throw new Error(
        `Не удалось отправить WhatsApp сообщение: ${this.formatAxiosError(error)}`,
      );
    }
  }

  /**
   * Проверяет номер и возвращает chatId
   */
  private async checkNumberExistsWithChatId(
    phoneNumber: string,
  ): Promise<{ exists: boolean; chatId?: string }> {
    try {
      const normalizedPhone = this.normalizePhoneNumber(phoneNumber);

      const response: AxiosResponse<WahaCheckExistsResponse> = await axios.get(
        `${this.apiUrl}/api/contacts/check-exists`,
        {
          params: {
            phone: normalizedPhone,
            session: this.session,
          },
          headers: {
            'X-Api-Key': this.apiToken,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 10000,
        },
      );

      return {
        exists: response.data.numberExists,
        chatId: response.data.chatId,
      };
    } catch (error) {
      this.logger.error(
        `Ошибка при проверке номера: ${this.formatAxiosError(error)}`,
      );
      throw error;
    }
  }

  /**
   * Проверяет доступность WAHA сервиса
   */
  async isServiceAvailable(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.apiUrl}/ping`, {
        headers: {
          'X-Api-Key': this.apiToken,
        },
        timeout: 5000,
      });
      return response.status === 200 && response.data.message === 'pong';
    } catch (error) {
      this.logger.error(
        `WAHA сервис недоступен: ${this.formatAxiosError(error)}`,
      );
      return false;
    }
  }

  /**
   * Проверяет, активна ли WAHA сессия
   */
  async isSessionActive(): Promise<boolean> {
    try {
      const response = await axios.get(
        `${this.apiUrl}/api/sessions/${this.session}`,
        {
          headers: {
            'X-Api-Key': this.apiToken,
          },
          timeout: 5000,
        },
      );

      const status = response.data.status;
      this.logger.log(`WAHA сессия ${this.session} статус: ${status}`);

      return status === 'WORKING';
    } catch (error) {
      this.logger.error(
        `Ошибка проверки статуса WAHA сессии: ${this.formatAxiosError(error)}`,
      );
      return false;
    }
  }
}
