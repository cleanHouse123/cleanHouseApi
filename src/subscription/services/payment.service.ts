import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { SubscriptionPaymentResponseDto } from '../dto/create-payment.dto';
import {
  SubscriptionPayment,
  SubscriptionPaymentStatus,
} from '../entities/subscription-payment.entity';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(SubscriptionPayment)
    private subscriptionPaymentRepository: Repository<SubscriptionPayment>,
    private configService: ConfigService,
  ) {}

  // Создание ссылки на оплату
  async createPaymentLink(
    subscriptionId: string,
    amount: number,
    subscriptionType?: string,
  ): Promise<SubscriptionPaymentResponseDto> {
    const paymentId = uuidv4();
    const baseUrl = this.configService.get<string>(
      'BASE_URL',
      'http://localhost:3000',
    );
    const paymentUrl = `${baseUrl}/payment/${paymentId}`;

    // Создаем платеж в базе данных
    const payment = this.subscriptionPaymentRepository.create({
      id: paymentId,
      subscriptionId,
      amount,
      subscriptionType,
      status: SubscriptionPaymentStatus.PENDING,
      paymentUrl,
    });

    await this.subscriptionPaymentRepository.save(payment);

    return {
      paymentUrl,
      paymentId,
      status: 'pending',
    };
  }

  // Получение информации о платеже
  async getPayment(paymentId: string): Promise<SubscriptionPayment | null> {
    return await this.subscriptionPaymentRepository.findOne({
      where: { id: paymentId },
    });
  }

  // Обновление статуса платежа
  async updatePaymentStatus(
    paymentId: string,
    status: string,
  ): Promise<SubscriptionPayment | null> {
    const payment = await this.subscriptionPaymentRepository.findOne({
      where: { id: paymentId },
    });

    if (payment) {
      payment.status = status as SubscriptionPaymentStatus;
      if (status === 'success') {
        payment.paidAt = new Date();
      }
      await this.subscriptionPaymentRepository.save(payment);
    }

    return payment;
  }

  // Симуляция успешной оплаты (для тестирования)
  async simulateSuccessfulPayment(
    paymentId: string,
  ): Promise<SubscriptionPayment | null> {
    const payment = await this.subscriptionPaymentRepository.findOne({
      where: { id: paymentId },
    });

    if (payment && payment.status === SubscriptionPaymentStatus.PENDING) {
      payment.status = SubscriptionPaymentStatus.SUCCESS;
      payment.paidAt = new Date();
      await this.subscriptionPaymentRepository.save(payment);
      return payment;
    }

    return null;
  }

  // Получение всех платежей (для админки)
  async getAllPayments(): Promise<SubscriptionPayment[]> {
    return await this.subscriptionPaymentRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  // Получение всех платежей (для отладки)
  async getAllPaymentIds(): Promise<string[]> {
    const payments = await this.subscriptionPaymentRepository.find({
      select: ['id'],
    });
    return payments.map((p) => p.id);
  }
}
