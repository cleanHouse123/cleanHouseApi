import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosResponse } from 'axios';

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
    this.apiUrl = this.configService.get<string>('WAHA_API_URL') || 'http://localhost:3001';
    this.apiToken = this.configService.get<string>('WAHA_API_TOKEN') || '0C85DAAA24374C408D0143B375233B6F';
    
    this.logger.log(`WAHA Service инициализирован. API URL: ${this.apiUrl}`);
    this.logger.log(`WAHA API Token настроен: ${this.apiToken ? 'да' : 'нет'}`);
  }

  /**
   * Нормализует номер телефона для WhatsApp
   */
  private normalizePhoneNumber(phoneNumber: string): string {
    // Убираем все символы кроме цифр
    let normalized = phoneNumber.replace(/\D/g, '');
    
    // Если номер начинается с 8, заменяем на 7 (Россия/Беларусь)
    if (normalized.startsWith('8')) {
      normalized = '7' + normalized.substring(1);
    }
    
    // Если номер начинается с +, убираем его
    if (normalized.startsWith('+')) {
      normalized = normalized.substring(1);
    }
    
    // Если номер начинается с 7, добавляем код страны
    if (normalized.startsWith('7') && normalized.length === 11) {
      // Российский номер
      return normalized;
    }
    
    // Если номер начинается с 375, это Беларусь
    if (normalized.startsWith('375')) {
      return normalized;
    }
    
    // Если номер начинается с 48, это Польша
    if (normalized.startsWith('48')) {
      return normalized;
    }
    
    // Для других стран добавляем код по умолчанию
    if (!normalized.startsWith('7') && !normalized.startsWith('375') && !normalized.startsWith('48')) {
      // Если номер короткий, добавляем код страны по умолчанию
      if (normalized.length < 10) {
        normalized = '7' + normalized;
      }
    }
    
    return normalized;
  }

  /**
   * Проверяет, зарегистрирован ли номер в WhatsApp
   * Согласно документации: GET /api/contacts/check-exists?phone=11231231231&session=default
   */
  async checkNumberExists(phoneNumber: string): Promise<boolean> {
    try {
      const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
      console.log(normalizedPhone, "normalizedPhone");
      
      this.logger.log(`Проверка номера в WhatsApp: ${phoneNumber} -> ${normalizedPhone}`);

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
            'Accept': 'application/json',
          },
          timeout: 10000,
        }
      );

      const exists = response.data.numberExists;
      const chatId = response.data.chatId;
      
      this.logger.log(`Номер ${normalizedPhone} ${exists ? 'зарегистрирован' : 'не зарегистрирован'} в WhatsApp`);
      if (chatId) {
        this.logger.log(`ChatId для номера ${normalizedPhone}: ${chatId}`);
      }
      
      return exists;
    } catch (error) {
      this.logger.error(`Ошибка при проверке номера в WhatsApp: ${error.message}`);
      throw new Error(`Не удалось проверить номер в WhatsApp: ${error.message}`);
    }
  }

  /**
   * Отправляет сообщение через WhatsApp
   * Согласно документации: POST /api/sendText
   */
  async sendMessage(phoneNumber: string, message: string): Promise<WahaResponse> {
    try {
      const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
      this.logger.log(`Отправка WhatsApp сообщения на номер: ${phoneNumber} -> ${normalizedPhone}`);

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
            'Accept': 'application/json',
          },
          timeout: 15000,
        }
      );

      if (response.data.success) {
        this.logger.log(`WhatsApp сообщение успешно отправлено в чат: ${chatId}`);
      } else {
        this.logger.error(`Ошибка отправки WhatsApp сообщения: ${response.data.error}`);
      }

      return response.data;
    } catch (error) {
      this.logger.error(`Ошибка при отправке WhatsApp сообщения: ${error.message}`);
      throw new Error(`Не удалось отправить WhatsApp сообщение: ${error.message}`);
    }
  }

  /**
   * Проверяет номер и возвращает chatId
   */
  private async checkNumberExistsWithChatId(phoneNumber: string): Promise<{exists: boolean, chatId?: string}> {
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
            'Accept': 'application/json',
          },
          timeout: 10000,
        }
      );

      return {
        exists: response.data.numberExists,
        chatId: response.data.chatId
      };
    } catch (error) {
      this.logger.error(`Ошибка при проверке номера: ${error.message}`);
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
      this.logger.error(`WAHA сервис недоступен: ${error.message}`);
      return false;
    }
  }

  /**
   * Проверяет, активна ли WAHA сессия
   */
  async isSessionActive(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.apiUrl}/api/sessions/${this.session}`, {
        headers: {
          'X-Api-Key': this.apiToken,
        },
        timeout: 5000,
      });
      
      const status = response.data.status;
      this.logger.log(`WAHA сессия ${this.session} статус: ${status}`);
      
      return status === 'WORKING';
    } catch (error) {
      this.logger.error(`Ошибка проверки статуса WAHA сессии: ${error.message}`);
      return false;
    }
  }
}
