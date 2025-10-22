import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { YookassaService } from 'nestjs-yookassa';
import { CurrencyEnum, ConfirmationEnum } from 'nestjs-yookassa';
import { OrderPaymentResponseDto } from '../dto/create-order-payment.dto';
import {
  Payment,
  PaymentStatus,
  PaymentMethod,
} from '../entities/payment.entity';

@Injectable()
export class OrderPaymentService {
  private payments = new Map<string, any>();

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    private configService: ConfigService,
    private yookassaService: YookassaService,
  ) {}

  // Создание ссылки на оплату заказа
  async createPaymentLink(
    orderId: string,
    amount: number,
  ): Promise<OrderPaymentResponseDto> {
    try {
      const baseUrl = this.configService.get<string>(
        'BASE_URL',
        'http://localhost:3000',
      );

      // Создаем новый платеж только если его нет
      const paymentId = uuidv4();

      // Проверяем, используются ли тестовые данные
      const shopId = this.configService.get('YOOKASSA_SHOP_ID');
      const isTestMode = shopId?.startsWith('test_');

      let yookassaPayment: any;

      if (isTestMode) {
        // Используем mock для тестовых данных
        console.log('Using mock YooKassa payment for test mode');
        yookassaPayment = {
          id: `mock_${paymentId}`,
          confirmation: {
            confirmation_url: `https://yoomoney.ru/checkout/payments/v2/contract?orderId=${paymentId}`,
          },
          status: 'pending',
        };
      } else {
        // Создаем реальный платеж в YooKassa
        console.log('Creating real YooKassa payment');
        yookassaPayment = await this.yookassaService.createPayment({
          amount: {
            value: amount,
            currency: CurrencyEnum.RUB,
          },
          confirmation: {
            type: ConfirmationEnum.redirect,
            return_url: `${baseUrl}/order-payment/success/${paymentId}`,
          },
          description: `Оплата заказа №${orderId}`,
          metadata: {
            orderId,
            paymentId,
          },
        });
      }

      // Временно убираем сохранение в БД для тестирования

      // Сохраняем информацию о платеже в памяти для быстрого доступа
      this.payments.set(paymentId, {
        id: paymentId,
        orderId,
        amount,
        status: 'pending',
        yookassaId: yookassaPayment.id,
        createdAt: new Date(),
      });

      return {
        paymentUrl:
          yookassaPayment.confirmation?.confirmation_url ||
          `${baseUrl}/order-payment/${paymentId}`,
        paymentId,
        status: 'pending',
      };
    } catch (error) {
      console.error('Error creating payment:', error);
      throw new Error(`Ошибка создания платежа: ${error.message}`);
    }
  }

  // Получение информации о платеже
  async getPayment(paymentId: string) {
    // Сначала проверяем в памяти (для временных платежей)
    const memoryPayment = this.payments.get(paymentId);
    if (memoryPayment) {
      return memoryPayment;
    }

    // Затем ищем в базе данных
    const dbPayment = await this.paymentRepository.findOne({
      where: { id: paymentId },
      relations: ['order'],
    });

    if (dbPayment) {
      return {
        id: dbPayment.id,
        orderId: dbPayment.orderId,
        amount: dbPayment.amount,
        status: dbPayment.status,
        createdAt: dbPayment.createdAt,
      };
    }

    return null;
  }

  // Обновление статуса платежа
  async updatePaymentStatus(paymentId: string, status: string) {
    // Обновляем в памяти
    const memoryPayment = this.payments.get(paymentId);
    if (memoryPayment) {
      memoryPayment.status = status;
      memoryPayment.updatedAt = new Date();
      this.payments.set(paymentId, memoryPayment);
    }

    // Обновляем в базе данных
    const dbPayment = await this.paymentRepository.findOne({
      where: { id: paymentId },
    });

    if (dbPayment) {
      dbPayment.status = status as PaymentStatus;
      await this.paymentRepository.save(dbPayment);
    }

    return memoryPayment || dbPayment;
  }

  // Симуляция успешной оплаты (для тестирования)
  async simulateSuccessfulPayment(paymentId: string) {
    const payment = this.payments.get(paymentId);
    if (payment && payment.status === 'pending') {
      payment.status = 'success';
      payment.paidAt = new Date();
      this.payments.set(paymentId, payment);

      // Обновляем в базе данных
      const dbPayment = await this.paymentRepository.findOne({
        where: { id: paymentId },
      });

      if (dbPayment) {
        dbPayment.status = PaymentStatus.PAID;
        await this.paymentRepository.save(dbPayment);
      }

      return payment;
    }
    return null;
  }

  // Обработка webhook от YooKassa
  async handleYookassaWebhook(webhookData: any) {
    const { object: payment } = webhookData;
    const { orderId, paymentId } = payment.metadata;

    if (!paymentId) {
      throw new Error('PaymentId не найден в metadata');
    }

    let status: PaymentStatus;
    switch (payment.status) {
      case 'succeeded':
        status = PaymentStatus.PAID;
        break;
      case 'canceled':
        status = PaymentStatus.FAILED;
        break;
      default:
        status = PaymentStatus.PENDING;
    }

    return await this.updatePaymentStatus(paymentId, status.toString());
  }

  // Проверка статуса платежа в YooKassa
  async checkPaymentStatus(paymentId: string) {
    const memoryPayment = this.payments.get(paymentId);
    if (!memoryPayment?.yookassaId) {
      return null;
    }

    try {
      // Используем getPayments для получения информации о платеже
      // В реальном проекте лучше использовать webhook'и для обновления статуса
      const payments = await this.yookassaService.getPayments(100);
      const yookassaPayment = payments.find(
        (p) => p.id === memoryPayment.yookassaId,
      );

      if (!yookassaPayment) {
        return memoryPayment;
      }

      let status: PaymentStatus;
      switch (yookassaPayment.status) {
        case 'succeeded':
          status = PaymentStatus.PAID;
          break;
        case 'canceled':
          status = PaymentStatus.FAILED;
          break;
        default:
          status = PaymentStatus.PENDING;
      }

      if (status !== PaymentStatus.PENDING) {
        await this.updatePaymentStatus(paymentId, status.toString());
      }

      return { ...memoryPayment, status: status.toString() };
    } catch (error) {
      console.error('Ошибка при проверке статуса платежа:', error);
      return memoryPayment;
    }
  }

  // Получение всех платежей (для админки)
  getAllPayments() {
    return Array.from(this.payments.values());
  }
}
