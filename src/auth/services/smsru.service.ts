import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

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

  async sendSms(phoneNumber: string, message: string): Promise<SmsRuResponse> {
    try {
      this.logger.log(`Отправка SMS на номер: ${phoneNumber}`);

      const response = await axios.get(this.baseUrl, {
        params: {
          api_id: this.apiId,
          to: phoneNumber,
          msg: message,
          json: 1,
        },
      });

      const result: SmsRuResponse = response.data;

      if (result.status === 'OK') {
        this.logger.log(
          `SMS успешно отправлена. ID: ${result.sms[phoneNumber]?.sms_id}`,
        );
      } else {
        this.logger.error(`Ошибка отправки SMS: ${result.status_code}`);
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
