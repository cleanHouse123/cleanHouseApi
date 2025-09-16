import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { SubscriptionPaymentResponseDto } from '../dto/create-payment.dto';
import {
  SubscriptionPayment,
  SubscriptionPaymentStatus,
} from '../entities/subscription-payment.entity';
import { Subscription } from '../entities/subscription.entity';
import { PriceValidationService } from './price-validation.service';
import { AuditService } from './audit.service';
import { PaymentAuditAction } from '../entities/payment-audit.entity';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(SubscriptionPayment)
    private subscriptionPaymentRepository: Repository<SubscriptionPayment>,
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    private configService: ConfigService,
    private priceValidationService: PriceValidationService,
    private auditService: AuditService,
    private dataSource: DataSource,
  ) {}

  // Создание ссылки на оплату с проверками безопасности
  async createPaymentLink(
    subscriptionId: string,
    amount: number,
    subscriptionType: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<SubscriptionPaymentResponseDto> {
    return await this.dataSource.transaction(async (manager) => {
      // Проверяем существование подписки и права доступа
      const subscription = await manager.findOne(Subscription, {
        where: { id: subscriptionId },
      });

      if (!subscription) {
        throw new BadRequestException('Подписка не найдена');
      }

      if (subscription.userId !== userId) {
        throw new ForbiddenException('Нет прав доступа к данной подписке');
      }

      // Валидируем цену
      this.priceValidationService.validateAmountRange(amount);
      this.priceValidationService.validatePrice(
        subscriptionType as any,
        amount,
      );

      // Проверяем, нет ли активных платежей для этой подписки
      const existingPayment = await manager.findOne(SubscriptionPayment, {
        where: {
          subscriptionId,
          status: SubscriptionPaymentStatus.PENDING,
        },
      });

      if (existingPayment) {
        throw new BadRequestException(
          'Для данной подписки уже существует ожидающий оплаты платеж',
        );
      }

      const paymentId = uuidv4();
      const baseUrl = this.configService.get<string>(
        'BASE_URL',
        'http://localhost:3000',
      );
      const paymentUrl = `${baseUrl}/payment/${paymentId}`;

      // Создаем платеж в базе данных
      const payment = manager.create(SubscriptionPayment, {
        id: paymentId,
        subscriptionId,
        amount,
        subscriptionType,
        status: SubscriptionPaymentStatus.PENDING,
        paymentUrl,
      });

      await manager.save(payment);

      // Логируем создание платежа
      await this.auditService.logPaymentAction(
        PaymentAuditAction.PAYMENT_CREATED,
        userId,
        {
          paymentId,
          subscriptionId,
          amount,
          metadata: { subscriptionType },
          ipAddress,
          userAgent,
        },
      );

      return {
        paymentUrl,
        paymentId,
        status: 'pending',
      };
    });
  }

  // Получение информации о платеже с проверкой прав доступа
  async getPayment(
    paymentId: string,
    userId?: string,
  ): Promise<SubscriptionPayment | null> {
    const payment = await this.subscriptionPaymentRepository.findOne({
      where: { id: paymentId },
    });

    if (!payment) {
      return null;
    }

    // Если передан userId, проверяем права доступа
    if (userId) {
      const subscription = await this.subscriptionRepository.findOne({
        where: { id: payment.subscriptionId },
      });

      if (!subscription || subscription.userId !== userId) {
        throw new ForbiddenException('Нет прав доступа к данному платежу');
      }
    }

    return payment;
  }

  // Обновление статуса платежа с аудитом
  async updatePaymentStatus(
    paymentId: string,
    status: string,
    userId?: string,
  ): Promise<SubscriptionPayment | null> {
    return await this.dataSource.transaction(async (manager) => {
      const payment = await manager.findOne(SubscriptionPayment, {
        where: { id: paymentId },
      });

      if (!payment) {
        return null;
      }

      // Получаем подписку для аудита
      const subscription = await manager.findOne(Subscription, {
        where: { id: payment.subscriptionId },
      });

      if (!subscription) {
        throw new BadRequestException('Подписка не найдена');
      }

      const oldStatus = payment.status;
      payment.status = status as SubscriptionPaymentStatus;

      if (status === 'success') {
        payment.paidAt = new Date();
      }

      await manager.save(payment);

      // Логируем изменение статуса
      const auditAction =
        status === 'success'
          ? PaymentAuditAction.PAYMENT_PAID
          : PaymentAuditAction.PAYMENT_FAILED;

      await this.auditService.logPaymentAction(
        auditAction,
        subscription.userId,
        {
          paymentId,
          subscriptionId: payment.subscriptionId,
          amount: payment.amount,
          metadata: { oldStatus, newStatus: status },
        },
      );

      return payment;
    });
  }

  // Симуляция успешной оплаты
  async simulateSuccessfulPayment(
    paymentId: string,
  ): Promise<SubscriptionPayment | null> {
    return await this.dataSource.transaction(async (manager) => {
      const payment = await manager.findOne(SubscriptionPayment, {
        where: { id: paymentId },
      });

      if (!payment) {
        throw new BadRequestException('Платеж не найден');
      }

      if (payment.status !== SubscriptionPaymentStatus.PENDING) {
        throw new BadRequestException(
          `Нельзя симулировать платеж со статусом ${payment.status}`,
        );
      }

      const subscription = await manager.findOne(Subscription, {
        where: { id: payment.subscriptionId },
      });

      if (!subscription) {
        throw new BadRequestException('Подписка не найдена');
      }

      payment.status = SubscriptionPaymentStatus.SUCCESS;
      payment.paidAt = new Date();
      await manager.save(payment);

      // Логируем симуляцию платежа
      await this.auditService.logPaymentAction(
        PaymentAuditAction.PAYMENT_PAID,
        subscription.userId,
        {
          paymentId,
          subscriptionId: payment.subscriptionId,
          amount: payment.amount,
          metadata: {
            isSimulation: true,
          },
        },
      );

      return payment;
    });
  }

  // Получение всех платежей (только для админов)
  async getAllPayments(): Promise<SubscriptionPayment[]> {
    return await this.subscriptionPaymentRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  // Получение платежей пользователя
  async getUserPayments(userId: string): Promise<SubscriptionPayment[]> {
    return await this.subscriptionPaymentRepository
      .createQueryBuilder('payment')
      .innerJoin(
        Subscription,
        'subscription',
        'subscription.id = payment.subscriptionId',
      )
      .where('subscription.userId = :userId', { userId })
      .orderBy('payment.createdAt', 'DESC')
      .getMany();
  }

  // Получение всех платежей (для отладки)
  async getAllPaymentIds(): Promise<string[]> {
    const payments = await this.subscriptionPaymentRepository.find({
      select: ['id'],
    });
    return payments.map((p) => p.id);
  }
}
