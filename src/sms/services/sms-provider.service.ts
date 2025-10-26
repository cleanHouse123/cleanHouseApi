import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WahaService } from './waha.service';
import { SmsRuService } from './smsru.service';

export interface SmsProviderResponse {
  success: boolean;
  message: string;
  channel: 'whatsapp' | 'sms';
  error?: string;
}

@Injectable()
export class SmsProviderService {
  private readonly logger = new Logger(SmsProviderService.name);

  constructor(
    private configService: ConfigService,
    private wahaService: WahaService,
    private smsRuService: SmsRuService,
  ) {}

  /**
   * Отправляет сообщение через WhatsApp с fallback на SMS
   * Логика: сначала пытается отправить через WhatsApp, если не получается - отправляет SMS
   */
  async sendMessage(
    phoneNumber: string,
    message: string,
    channel: 'whatsapp' | 'sms' | 'auto' = 'auto',
  ): Promise<SmsProviderResponse> {
    const signedMessage = this.signMessage(message);

    // Если явно указан канал SMS, отправляем только SMS
    if (channel === 'sms') {
      return this.sendSms(phoneNumber, signedMessage);
    }

    // Если явно указан WhatsApp, пытаемся отправить только через WhatsApp
    if (channel === 'whatsapp') {
      try {

        console.log(phoneNumber, "phoneNumber");
        
        await this.wahaService.sendMessage(phoneNumber, signedMessage);
        return {
          success: true,
          message: 'Сообщение отправлено через WhatsApp',
          channel: 'whatsapp',
        };
      } catch (error) {
        this.logger.error(`Ошибка отправки через WhatsApp: ${error.message}`);
        throw error; // Не делаем fallback, если явно запрошен WhatsApp
      }
    }

    // Автоматический режим: сначала WhatsApp, потом SMS
    if (channel === 'auto') {
      try {
        await this.wahaService.sendMessage(phoneNumber, signedMessage);
        return {
          success: true,
          message: 'Сообщение отправлено через WhatsApp',
          channel: 'whatsapp',
        };
      } catch (error) {
        this.logger.error(`Ошибка отправки через WhatsApp: ${error.message} fallback на SMS`);
        
        return this.sendSms(phoneNumber, signedMessage);
      }
    }

    throw new Error('Неподдерживаемый канал отправки');
  }

  /**
   * Отправляет SMS через SMS.RU
   */
  private async sendSms(phoneNumber: string, message: string): Promise<SmsProviderResponse> {
    try {
      this.logger.log(`Отправка SMS на номер: ${phoneNumber}`);
      
      const result = await this.smsRuService.sendSms(phoneNumber, message);
      
      if (result.status === 'OK') {
        return {
          success: true,
          message: 'SMS успешно отправлена',
          channel: 'sms',
        };
      } else {
        throw new Error(`Ошибка отправки SMS: ${result.status_code}`);
      }
    } catch (error) {
      this.logger.error(`Ошибка отправки SMS: ${error.message}`);
      return {
        success: false,
        message: 'Не удалось отправить SMS',
        channel: 'sms',
        error: error.message,
      };
    }
  }

  /**
   * Подписывает сообщение для тестовой среды
   */
  private signMessage(message: string): string {
    const host = this.configService.get<string>('HOST');
    
    if (host && host.includes('qa.')) {
      return `${message}\n\n[QA Environment]: ${host}`;
    }
    
    return message;
  }

  /**
   * Отправляет код верификации с автоматическим выбором канала
   */
  async sendVerificationCode(
    phoneNumber: string,
    code: string,
    channel: 'whatsapp' | 'sms' | 'auto' = 'auto',
  ): Promise<SmsProviderResponse> {
    const message = `Ваш код верификации: ${code}`;
    return this.sendMessage(phoneNumber, message, channel);
  }
}
