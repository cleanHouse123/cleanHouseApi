import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3';

export interface CreateRefundParams {
  /** Идентификатор платежа в YooKassa */
  yookassaPaymentId: string;
  /** Сумма возврата в копейках */
  amountInKopecks: number;
  description: string;
}

export interface RefundResult {
  id: string;
  status: 'pending' | 'succeeded' | 'canceled';
  amountInKopecks: number;
}

/**
 * Возврат денег через API YooKassa.
 *
 * Метод библиотеки `createRefund` не подходит: он всегда возвращает полную сумму
 * платежа и генерирует новый ключ идемпотентности на каждый вызов, поэтому
 * повторный запрос создаёт второй возврат. Здесь сумма передаётся явно, а ключ
 * детерминированный — повтор по той же сумме не уводит деньги дважды.
 */
@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(private readonly configService: ConfigService) {}

  private getCredentials(): { shopId: string; secretKey: string } {
    const useTestMode =
      this.configService.get<string>('YOOKASSA_USE_TEST_MODE') === 'true';
    const shopId = useTestMode
      ? this.configService.get<string>('YOOKASSA_SHOP_ID_TEST')
      : this.configService.get<string>('YOOKASSA_SHOP_ID');
    const secretKey = useTestMode
      ? this.configService.get<string>('YOOKASSA_SECRET_KEY_TEST')
      : this.configService.get<string>('YOOKASSA_SECRET_KEY');

    if (!shopId || !secretKey) {
      throw new BadRequestException(
        'Не настроены ключи YooKassa: возврат невозможен',
      );
    }

    return { shopId, secretKey };
  }

  private buildIdempotenceKey(params: CreateRefundParams): string {
    return `refund-${params.yookassaPaymentId}-${params.amountInKopecks}`;
  }

  async createRefund(params: CreateRefundParams): Promise<RefundResult> {
    if (params.amountInKopecks <= 0) {
      throw new BadRequestException('Сумма возврата должна быть больше нуля');
    }

    if (this.configService.get<string>('YOOKASSA_MOCK_PAYMENTS') === 'true') {
      this.logger.log(
        `Mock-возврат ${params.amountInKopecks} коп. по платежу ${params.yookassaPaymentId}`,
      );
      return {
        id: `mock_refund_${params.yookassaPaymentId}`,
        status: 'succeeded',
        amountInKopecks: params.amountInKopecks,
      };
    }

    const { shopId, secretKey } = this.getCredentials();

    try {
      const response = await axios.post(
        `${YOOKASSA_API_URL}/refunds`,
        {
          payment_id: params.yookassaPaymentId,
          amount: {
            value: (params.amountInKopecks / 100).toFixed(2),
            currency: 'RUB',
          },
          description: params.description,
        },
        {
          auth: { username: shopId, password: secretKey },
          headers: {
            'Content-Type': 'application/json',
            'Idempotence-Key': this.buildIdempotenceKey(params),
          },
        },
      );

      const data = response.data as {
        id: string;
        status: RefundResult['status'];
        amount: { value: string };
      };

      return {
        id: data.id,
        status: data.status,
        amountInKopecks: Math.round(parseFloat(data.amount.value) * 100),
      };
    } catch (error) {
      const description = (
        error as { response?: { data?: { description?: string } } }
      )?.response?.data?.description;

      this.logger.error(
        `Возврат по платежу ${params.yookassaPaymentId} не прошёл: ${description ?? String(error)}`,
      );
      throw new BadRequestException(
        description ?? 'YooKassa отклонила возврат. Попробуйте позже',
      );
    }
  }
}
