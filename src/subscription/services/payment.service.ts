import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { SubscriptionPaymentResponseDto } from '../dto/create-payment.dto';

@Injectable()
export class PaymentService {
  private payments = new Map<string, any>();

  constructor(private configService: ConfigService) {}

  // Создание ссылки на оплату
  createPaymentLink(
    subscriptionId: string,
    amount: number,
    subscriptionType?: string,
  ): SubscriptionPaymentResponseDto {
    const paymentId = uuidv4();
    const baseUrl = this.configService.get<string>(
      'BASE_URL',
      'http://localhost:3000',
    );
    const paymentUrl = `${baseUrl}/payment/${paymentId}`;

    // Сохраняем информацию о платеже
    this.payments.set(paymentId, {
      id: paymentId,
      subscriptionId,
      amount,
      subscriptionType,
      status: 'pending',
      createdAt: new Date(),
    });

    return {
      paymentUrl,
      paymentId,
      status: 'pending',
    };
  }

  // Получение информации о платеже
  getPayment(paymentId: string) {
    return this.payments.get(paymentId);
  }

  // Обновление статуса платежа
  updatePaymentStatus(paymentId: string, status: string) {
    const payment = this.payments.get(paymentId);
    if (payment) {
      payment.status = status;
      payment.updatedAt = new Date();
      this.payments.set(paymentId, payment);
    }
    return payment;
  }

  // Симуляция успешной оплаты (для тестирования)
  simulateSuccessfulPayment(paymentId: string) {
    const payment = this.payments.get(paymentId);
    if (payment && payment.status === 'pending') {
      payment.status = 'success';
      payment.paidAt = new Date();
      this.payments.set(paymentId, payment);
      return payment;
    }
    return null;
  }

  // Получение всех платежей (для админки)
  getAllPayments() {
    return Array.from(this.payments.values());
  }
}
