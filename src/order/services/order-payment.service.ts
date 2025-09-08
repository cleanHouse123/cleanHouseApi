import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
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
  ) {}

  // Создание ссылки на оплату заказа
  async createPaymentLink(
    orderId: string,
    amount: number,
  ): Promise<OrderPaymentResponseDto> {
    // Проверяем, есть ли уже платеж для этого заказа
    const existingPayment = await this.paymentRepository.findOne({
      where: { orderId },
    });

    const baseUrl = this.configService.get<string>(
      'BASE_URL',
      'http://localhost:3000',
    );

    if (existingPayment) {
      // Если платеж уже существует, возвращаем его
      const paymentUrl = `${baseUrl}/order-payment/${existingPayment.id}`;

      // Сохраняем в памяти для быстрого доступа
      this.payments.set(existingPayment.id, {
        id: existingPayment.id,
        orderId: existingPayment.orderId,
        amount: existingPayment.amount,
        status: existingPayment.status,
        createdAt: existingPayment.createdAt,
      });

      return {
        paymentUrl,
        paymentId: existingPayment.id,
        status: existingPayment.status,
      };
    }

    // Создаем новый платеж только если его нет
    const paymentId = uuidv4();
    const paymentUrl = `${baseUrl}/order-payment/${paymentId}`;

    const payment = this.paymentRepository.create({
      id: paymentId,
      orderId,
      amount,
      status: PaymentStatus.PENDING,
      method: PaymentMethod.ONLINE,
    });

    await this.paymentRepository.save(payment);

    // Сохраняем информацию о платеже в памяти для быстрого доступа
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

  // Получение всех платежей (для админки)
  getAllPayments() {
    return Array.from(this.payments.values());
  }
}
