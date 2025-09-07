import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosResponse } from 'axios';

interface TelegramGatewayResponse {
  ok: boolean;
  result?: RequestStatus;
  error?: string;
}

interface RequestStatus {
  request_id: string;
  phone_number: string;
  request_cost: number;
  is_refunded?: boolean;
  remaining_balance?: number;
  delivery_status?: DeliveryStatus;
  verification_status?: VerificationStatus;
  payload?: string;
}

interface DeliveryStatus {
  status: 'sent' | 'delivered' | 'read' | 'expired' | 'revoked';
  updated_at: number;
}

interface VerificationStatus {
  status:
    | 'code_valid'
    | 'code_invalid'
    | 'code_max_attempts_exceeded'
    | 'expired';
  updated_at: number;
  code_entered?: string;
}

interface SendVerificationMessageParams {
  phone_number: string;
  request_id?: string;
  sender_username?: string;
  code?: string;
  code_length?: number;
  callback_url?: string;
  payload?: string;
  ttl?: number;
}

interface CheckSendAbilityParams {
  phone_number: string;
}

interface CheckVerificationStatusParams {
  request_id: string;
  code?: string;
}

@Injectable()
export class TelegramGatewayService {
  private readonly logger = new Logger(TelegramGatewayService.name);
  private readonly apiToken: string;
  private readonly baseUrl = 'https://gatewayapi.telegram.org';

  constructor(private configService: ConfigService) {
    // Используем process.env напрямую, так как ConfigModule может не читать файл правильно
    this.apiToken =
      process.env.TELEGRAM_GATEWAY_TOKEN ||
      'AAEYJQAAh43tuSpLbRnlRl9pHYqzeN6gCVSHd9OB46JbbQ';

    this.logger.debug(
      `process.env TELEGRAM_GATEWAY_TOKEN: ${process.env.TELEGRAM_GATEWAY_TOKEN}`,
    );
    this.logger.debug(
      `Итоговый токен: ${this.apiToken ? 'настроен' : 'не настроен'}`,
    );

    if (!this.apiToken) {
      this.logger.warn('TELEGRAM_GATEWAY_TOKEN не настроен');
    }
  }

  /**
   * Проверяет возможность отправки сообщения на номер
   */
  async checkSendAbility(phoneNumber: string): Promise<RequestStatus> {
    try {
      const params: CheckSendAbilityParams = {
        phone_number: phoneNumber,
      };

      const response = await this.makeRequest('checkSendAbility', params);

      if (!response.ok || !response.result) {
        throw new Error(
          response.error || 'Ошибка проверки возможности отправки',
        );
      }

      return response.result;
    } catch (error) {
      this.logger.error('Ошибка проверки возможности отправки:', error);
      throw error;
    }
  }

  /**
   * Отправляет код верификации через Telegram
   */
  async sendVerificationMessage(
    phoneNumber: string,
    options: {
      requestId?: string;
      senderUsername?: string;
      code?: string;
      codeLength?: number;
      callbackUrl?: string;
      payload?: string;
      ttl?: number;
    } = {},
  ): Promise<RequestStatus> {
    try {
      const params: SendVerificationMessageParams = {
        phone_number: phoneNumber,
        ...options,
      };

      const response = await this.makeRequest(
        'sendVerificationMessage',
        params,
      );

      if (!response.ok || !response.result) {
        throw new Error(response.error || 'Ошибка отправки кода верификации');
      }

      return response.result;
    } catch (error) {
      this.logger.error('Ошибка отправки кода верификации:', error);
      throw error;
    }
  }

  /**
   * Проверяет статус верификации
   */
  async checkVerificationStatus(
    requestId: string,
    code?: string,
  ): Promise<RequestStatus> {
    try {
      const params: CheckVerificationStatusParams = {
        request_id: requestId,
        ...(code && { code }),
      };

      const response = await this.makeRequest(
        'checkVerificationStatus',
        params,
      );

      if (!response.ok || !response.result) {
        throw new Error(
          response.error || 'Ошибка проверки статуса верификации',
        );
      }

      return response.result;
    } catch (error) {
      this.logger.error('Ошибка проверки статуса верификации:', error);
      throw error;
    }
  }

  /**
   * Отзывает сообщение верификации
   */
  async revokeVerificationMessage(requestId: string): Promise<RequestStatus> {
    try {
      const params = {
        request_id: requestId,
      };

      const response = await this.makeRequest(
        'revokeVerificationMessage',
        params,
      );

      if (!response.ok || !response.result) {
        throw new Error(response.error || 'Ошибка отзыва сообщения');
      }

      return response.result;
    } catch (error) {
      this.logger.error('Ошибка отзыва сообщения:', error);
      throw error;
    }
  }

  /**
   * Форматирует номер телефона в формат E.164
   */
  formatPhoneNumber(phoneNumber: string): string {
    // Убираем все нецифровые символы
    let cleanNumber = phoneNumber.replace(/\D/g, '');

    // Если номер начинается с 8, заменяем на 7
    if (cleanNumber.startsWith('8') && cleanNumber.length === 11) {
      cleanNumber = '7' + cleanNumber.slice(1);
    }

    // Добавляем + в начало
    return '+' + cleanNumber;
  }

  /**
   * Проверяет валидность номера телефона
   */
  validatePhoneNumber(phoneNumber: string): boolean {
    const formatted = this.formatPhoneNumber(phoneNumber);
    const cleanNumber = formatted.replace('+', '');

    // Проверяем российские и белорусские номера
    if (cleanNumber.startsWith('7') && cleanNumber.length === 11) {
      return true;
    }

    if (cleanNumber.startsWith('375') && cleanNumber.length === 12) {
      return true;
    }

    return false;
  }

  /**
   * Выполняет HTTP запрос к Telegram Gateway API
   */
  private async makeRequest(
    method: string,
    params: Record<string, any>,
  ): Promise<TelegramGatewayResponse> {
    if (!this.apiToken) {
      throw new Error('TELEGRAM_GATEWAY_TOKEN не настроен');
    }

    const url = `${this.baseUrl}/${method}`;

    const config = {
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      params: {
        ...params,
        access_token: this.apiToken,
      },
    };

    try {
      const response: AxiosResponse<TelegramGatewayResponse> = await axios.post(
        url,
        params,
        config,
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data?.error || error.message;
        throw new Error(`Telegram Gateway API error: ${errorMessage}`);
      }
      throw error;
    }
  }
}
