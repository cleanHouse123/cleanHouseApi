import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { OrderPaymentResponseDto } from '../dto/create-order-payment.dto';

@Injectable()
export class OrderPaymentService {
  private payments = new Map<string, any>();

  // Создание ссылки на оплату заказа
  createPaymentLink(orderId: string, amount: number): OrderPaymentResponseDto {
    const paymentId = uuidv4();
    const paymentUrl = `http://localhost:3000/order-payment/${paymentId}`;

    // Сохраняем информацию о платеже
    this.payments.set(paymentId, {
      id: paymentId,
      orderId,
      amount,
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
