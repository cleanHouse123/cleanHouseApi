import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { YookassaService } from 'nestjs-yookassa';
import { CurrencyEnum, ConfirmationEnum } from 'nestjs-yookassa';
import { SubscriptionPaymentResponseDto } from '../dto/create-payment.dto';
import {
  SubscriptionPayment,
  SubscriptionPaymentStatus,
} from '../entities/subscription-payment.entity';
import { Subscription } from '../entities/subscription.entity';
import { PriceValidationService } from './price-validation.service';
import { AuditService } from './audit.service';
import { PaymentAuditAction } from '../entities/payment-audit.entity';
import {
  ReceiptDto,
  ReceiptItemDto,
  CustomerDto,
  PaymentSubject,
  PaymentMode,
} from '../../shared/dto/receipt.dto';
import { VatCodesEnum } from 'nestjs-yookassa/dist/interfaces/receipt-details.interface';

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
    private yookassaService: YookassaService,
  ) {}

  // Создание данных для чека подписки
  private createSubscriptionReceipt(
    subscriptionType: string,
    amount: number,
    customerEmail: string,
  ): ReceiptDto {
    const receiptItem: ReceiptItemDto = {
      description: `Подписка ${subscriptionType}`,
      quantity: 1,
      amount: {
        value: amount / 100,
        currency: CurrencyEnum.RUB,
      },
      vat_code: VatCodesEnum.ndsNone,
      payment_subject: PaymentSubject.SERVICE,
      payment_mode: PaymentMode.FULL_PAYMENT,
    };

    const customer: CustomerDto = {
      email: customerEmail,
    };

    return {
      customer,
      items: [receiptItem],
      send: true,
    };
  }

  // Создание ссылки на оплату с проверками безопасности
  async createPaymentLink(
    subscriptionId: string,
    amount: number,
    subscriptionType: string,
    planId: string,
    userId: string,
    customerEmail?: string,
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

      // Валидируем цену по плану подписки
      this.priceValidationService.validateAmountRange(amount);
      const subscriptionPlan =
        await this.priceValidationService.validatePaymentByPlanId(
          planId,
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
      const frontendUrl = this.configService.get<string>(
        'FRONTEND_URL',
        'http://localhost:5173',
      );

      // Проверяем, используются ли тестовые данные
      const shopId = this.configService.get('YOOKASSA_SHOP_ID');
      const isTestMode = shopId?.startsWith('test_');
      console.log('YooKassa config check:', { shopId, isTestMode });

      let yookassaPayment: any;

      if (isTestMode) {
        // Используем mock для тестовых данных
        console.log('Using mock YooKassa payment for subscription test mode');
        yookassaPayment = {
          id: `mock_${paymentId}`,
          confirmation: {
            confirmation_url: `https://yoomoney.ru/checkout/payments/v2/contract?orderId=${paymentId}`,
          },
          status: 'pending',
        };
      } else {
        // Создаем реальный платеж в YooKassa
        console.log('Creating real YooKassa payment for subscription');
        console.log('AMOUNTTTTT', amount, subscriptionType);
        console.log('Converted amount for YooKassa:', amount / 100);
        console.log('Payment metadata:', {
          subscriptionId,
          paymentId,
          planId,
          userId,
        });

        const frontendUrl = this.configService.get<string>(
          'FRONTEND_URL',
          'http://localhost:5173',
        );
        const returnUrl = `${frontendUrl}/payment/result?paymentId=${paymentId}&type=subscription`;
        console.log('Return URL:', returnUrl);

        // Создаем данные для платежа
        const paymentData: any = {
          amount: {
            value: amount / 100,
            currency: CurrencyEnum.RUB,
          },
          confirmation: {
            type: ConfirmationEnum.redirect,
            return_url: returnUrl,
          },
          description: `Оплата подписки ${subscriptionType}`,
          capture: true, // Автоматический захват средств
          metadata: {
            subscriptionId,
            paymentId,
          },
        };

        // Создаем чек - используем email пользователя или резервный
        const receiptEmail = customerEmail || 'shuminskiy23@gmail.com';
        const receipt = this.createSubscriptionReceipt(
          subscriptionType,
          amount,
          receiptEmail,
        );
        paymentData.receipt = receipt as any;

        if (customerEmail) {
          console.log(
            'Чек будет отправлен на email пользователя:',
            customerEmail,
          );
        } else {
          console.log(
            'Email пользователя не указан, чек будет отправлен на резервный email:',
            receiptEmail,
          );
        }

        try {
          yookassaPayment =
            await this.yookassaService.createPayment(paymentData);

          console.log('YooKassa payment created successfully:', {
            id: yookassaPayment.id,
            status: yookassaPayment.status,
            confirmation_url: yookassaPayment.confirmation?.confirmation_url,
          });
        } catch (error) {
          console.error(
            'Ошибка создания платежа YooKassa для подписки:',
            error,
          );

          // Обработка специфических ошибок согласно документации
          if (error.message?.includes('Payment method is not available')) {
            throw new Error('Выбранный метод оплаты недоступен');
          }

          if (error.message?.includes('Incorrect currency')) {
            throw new Error('Некорректная валюта платежа');
          }

          throw new Error('Ошибка при создании платежа подписки');
        }
      }

      // Создаем платеж в базе данных
      const payment = manager.create(SubscriptionPayment, {
        id: paymentId,
        subscriptionId,
        amount,
        subscriptionType,
        status: SubscriptionPaymentStatus.PENDING,
        yookassaId: yookassaPayment.id,
        paymentUrl:
          yookassaPayment.confirmation?.confirmation_url ||
          `${baseUrl}/subscription-payment/${paymentId}`,
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
          metadata: {
            subscriptionType,
            planId,
            planName: subscriptionPlan.name,
          },
          ipAddress,
          userAgent,
        },
      );

      return {
        paymentUrl:
          yookassaPayment.confirmation?.confirmation_url ||
          `${baseUrl}/subscription-payment/${paymentId}`,
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

  async findByYookassaId(
    yookassaId: string,
  ): Promise<SubscriptionPayment | null> {
    return await this.subscriptionPaymentRepository.findOne({
      where: { yookassaId: yookassaId },
    });
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

  // Обработка webhook от YooKassa
  async handleYookassaWebhook(webhookData: any) {
    console.log('=== SUBSCRIPTION WEBHOOK DEBUG ===');
    console.log('Webhook data:', JSON.stringify(webhookData, null, 2));

    const { object: payment } = webhookData;
    console.log('Payment object:', JSON.stringify(payment, null, 2));
    console.log('Payment metadata:', payment.metadata);

    const { subscriptionId, paymentId } = payment.metadata;
    console.log('Extracted metadata:', { subscriptionId, paymentId });

    if (!paymentId) {
      console.error('PaymentId не найден в metadata');
      throw new Error('PaymentId не найден в metadata');
    }

    let status: SubscriptionPaymentStatus;
    switch (payment.status) {
      case 'succeeded':
        status = SubscriptionPaymentStatus.SUCCESS;
        break;
      case 'canceled':
        status = SubscriptionPaymentStatus.FAILED;
        break;
      default:
        status = SubscriptionPaymentStatus.PENDING;
    }

    // Не передаем userId, так как его нет в metadata - он будет получен из подписки
    return await this.updatePaymentStatus(paymentId, status.toString());
  }

  // Проверка статуса платежа в YooKassa
  async checkPaymentStatus(paymentId: string, userId?: string) {
    const payment = await this.getPayment(paymentId, userId);
    if (!payment) {
      return null;
    }

    // Если платеж уже завершен, возвращаем его статус
    if (payment.status !== SubscriptionPaymentStatus.PENDING) {
      return payment;
    }

    try {
      // Получаем YooKassa ID из метаданных (нужно будет сохранять при создании)
      // Пока используем заглушку для проверки статуса
      return payment;
    } catch (error) {
      console.error('Ошибка при проверке статуса платежа:', error);
      return payment;
    }
  }

  // Получение всех платежей (для отладки)
  async getAllPaymentIds(): Promise<string[]> {
    const payments = await this.subscriptionPaymentRepository.find({
      select: ['id'],
    });
    return payments.map((p) => p.id);
  }
}
