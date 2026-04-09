import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { normalizePhoneToE164 } from '../../shared/utils/phone-normalizer.util';

export interface SmsRuResponse {
  status: string;
  status_code: number;
  sms: {
    [phoneNumber: string]: {
      status: string;
      status_code: number;
      sms_id?: string;
      status_text?: string;
    };
  };
  balance: number;
}

@Injectable()
export class SmsRuService {
  private readonly logger = new Logger(SmsRuService.name);
  private readonly apiId: string;
  private readonly baseUrl = 'https://sms.ru/sms/send';

  constructor(private configService: ConfigService) {
    this.apiId =
      this.configService.get<string>('SMS_RU_API_ID') ||
      'CC0407DF-6C25-C212-F345-A1A9312363C2';
    this.logger.log(`SMS_RU_API_ID настроен: ${this.apiId ? 'да' : 'нет'}`);
  }

  private normalizePhoneNumber(phoneNumber: string): string {
    const cleaned = phoneNumber.replace(/\s+/g, '').trim();
    try {
      return normalizePhoneToE164(cleaned).replace('+', '');
    } catch {
      const digits = cleaned.replace(/\D/g, '');
      if (!digits) {
        throw new Error('Пустой номер телефона');
      }
      if (digits.length === 10) {
        return `7${digits}`;
      }
      if (digits.length === 11 && digits.startsWith('8')) {
        return `7${digits.slice(1)}`;
      }
      if (digits.length === 11 && digits.startsWith('7')) {
        return digits;
      }
      throw new Error(`Некорректный номер телефона: ${phoneNumber}`);
    }
  }

  async sendSms(phoneNumber: string, message: string): Promise<SmsRuResponse> {
    try {
      const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
      this.logger.log(
        `Отправка SMS на номер: ${phoneNumber} -> ${normalizedPhone}`,
      );

      const response = await axios.get(this.baseUrl, {
        params: {
          api_id: this.apiId,
          to: normalizedPhone,
          msg: message,
          json: 1,
        },
      });

      const result: SmsRuResponse = response.data;
      const smsEntry =
        result.sms?.[normalizedPhone] || Object.values(result.sms || {})[0];

      if (result.status === 'OK' && smsEntry?.status === 'OK') {
        this.logger.log(
          `SMS успешно отправлена. ID: ${smsEntry?.sms_id || 'unknown'}`,
        );
      } else {
        const errorText =
          smsEntry?.status_text ||
          `status=${result.status}; status_code=${result.status_code}`;
        this.logger.error(`Ошибка отправки SMS: ${errorText}`);
        throw new Error(`SMS.RU rejected message: ${errorText}`);
      }

      return result;
    } catch (error) {
      this.logger.error(`Ошибка при отправке SMS: ${error.message}`);
      throw new Error('Не удалось отправить SMS');
    }
  }

  async sendVerificationCode(
    phoneNumber: string,
    code: string,
  ): Promise<SmsRuResponse> {
    const message = `Ваш код подтверждения: ${code}`;
    return this.sendSms(phoneNumber, message);
  }

  async checkBalance(): Promise<number> {
    try {
      const response = await axios.get('https://sms.ru/my/balance', {
        params: {
          api_id: this.apiId,
          json: 1,
        },
      });

      return response.data.balance;
    } catch (error) {
      this.logger.error(`Ошибка при проверке баланса: ${error.message}`);
      throw new Error('Не удалось проверить баланс');
    }
  }
}
