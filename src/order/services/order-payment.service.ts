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
import {
  ReceiptDto,
  ReceiptItemDto,
  CustomerDto,
  PaymentSubject,
  PaymentMode,
} from '../../shared/dto/receipt.dto';
import { VatCodesEnum } from 'nestjs-yookassa/dist/interfaces/receipt-details.interface';

@Injectable()
export class OrderPaymentService {
  private payments = new Map<string, any>();

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    private configService: ConfigService,
    private yookassaService: YookassaService,
  ) {}

  // Создание данных для чека заказа
  private createOrderReceipt(
    orderId: string,
    amount: number,
    customerEmail: string,
  ): ReceiptDto {
    // Создаем одну позицию для всего заказа
    const items: ReceiptItemDto[] = [
      {
        description: `Услуги клининга по заказу №${orderId}`,
        quantity: 1,
        amount: {
          value: amount / 100,
          currency: CurrencyEnum.RUB,
        },
        vat_code: VatCodesEnum.ndsNone,
        payment_subject: PaymentSubject.SERVICE,
        payment_mode: PaymentMode.FULL_PAYMENT,
      },
    ];

    const customer: CustomerDto = {
      email: customerEmail,
    };

    return {
      customer,
      items,
      send: true,
    };
  }

  // Создание ссылки на оплату заказа
  async createPaymentLink(
    orderId: string,
    amount: number,
    customerEmail?: string,
  ): Promise<OrderPaymentResponseDto> {
    try {
      const baseUrl = this.configService.get<string>(
        'BASE_URL',
        'http://localhost:3000',
      );
      const frontendUrl = this.configService.get<string>(
        'FRONTEND_URL',
        'http://localhost:5173',
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

        // Создаем данные для платежа
        const paymentData: any = {
          amount: {
            value: amount / 100,
            currency: CurrencyEnum.RUB,
          },
          confirmation: {
            type: ConfirmationEnum.redirect,
            return_url: `${frontendUrl}/payment/result?paymentId=${paymentId}&type=order`,
          },
          description: `Оплата заказа №${orderId}`,
          capture: true, // Автоматический захват средств
          metadata: {
            orderId,
            paymentId,
          },
        };

        // Создаем чек - используем email пользователя или резервный
        const receiptEmail = customerEmail || 'Chisto.doma1@mail.ru';
        const receipt = this.createOrderReceipt(orderId, amount, receiptEmail);
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
        } catch (error) {
          console.error('Ошибка создания платежа YooKassa:', error);

          // Обработка специфических ошибок согласно документации
          if (error.message?.includes('Payment method is not available')) {
            throw new Error('Выбранный метод оплаты недоступен');
          }

          if (error.message?.includes('Incorrect currency')) {
            throw new Error('Некорректная валюта платежа');
          }

          throw new Error('Ошибка при создании платежа');
        }
      }

      // Проверяем, не существует ли уже платеж с таким ID
      const existingPayment = await this.paymentRepository.findOne({
        where: { id: paymentId },
      });

      let payment: Payment;
      if (existingPayment) {
        // Обновляем существующий платеж
        existingPayment.yookassaId = yookassaPayment.id;
        existingPayment.amount = amount;
        payment = await this.paymentRepository.save(existingPayment);
        console.log(`🔄 Обновлен существующий платеж ${paymentId}`);
      } else {
        // Создаем новый платеж в базе данных
        payment = this.paymentRepository.create({
          id: paymentId,
          orderId,
          amount,
          status: PaymentStatus.PENDING,
          method: PaymentMethod.ONLINE,
          yookassaId: yookassaPayment.id,
        });

        payment = await this.paymentRepository.save(payment);
        console.log(`✅ Создан новый платеж в БД: ${paymentId} для заказа ${orderId}`);
      }

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

  async findByYookassaId(yookassaId: string) {
    // Сначала проверяем в памяти
    for (const [, payment] of this.payments) {
      if (payment.yookassaId === yookassaId) {
        return payment;
      }
    }

    // Затем ищем в базе данных
    const dbPayment = await this.paymentRepository.findOne({
      where: { yookassaId: yookassaId },
      relations: ['order'],
    });

    if (dbPayment) {
      return {
        id: dbPayment.id,
        orderId: dbPayment.orderId,
        amount: dbPayment.amount,
        status: dbPayment.status,
        yookassaId: dbPayment.yookassaId,
        createdAt: dbPayment.createdAt,
      };
    }

    return null;
  }

  // Обновление статуса платежа
  async updatePaymentStatus(paymentId: string, status: string) {
    console.log(`🔄 Обновление статуса платежа ${paymentId} на ${status}`);
    
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
      relations: ['order'],
    });

    if (dbPayment) {
      dbPayment.status = status as PaymentStatus;
      await this.paymentRepository.save(dbPayment);
      console.log(`✅ Статус платежа ${paymentId} обновлен в БД: ${status}`);
      
      // Возвращаем объект с правильной структурой
      return {
        id: dbPayment.id,
        orderId: dbPayment.orderId,
        amount: dbPayment.amount,
        status: dbPayment.status,
        yookassaId: dbPayment.yookassaId,
        createdAt: dbPayment.createdAt,
      };
    } else {
      console.warn(`⚠️ Платеж ${paymentId} не найден в БД`);
    }

    // Если платеж только в памяти, возвращаем его
    if (memoryPayment) {
      return {
        id: memoryPayment.id,
        orderId: memoryPayment.orderId,
        amount: memoryPayment.amount,
        status: memoryPayment.status,
        yookassaId: memoryPayment.yookassaId,
        createdAt: memoryPayment.createdAt,
      };
    }

    return null;
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
    console.log('📥 Обработка webhook от YooKassa для заказа');
    console.log('Webhook data:', JSON.stringify(webhookData, null, 2));
    
    const { object: payment } = webhookData;
    const { orderId, paymentId } = payment.metadata || {};

    if (!paymentId) {
      console.error('❌ PaymentId не найден в metadata');
      throw new Error('PaymentId не найден в metadata');
    }

    console.log(`🔍 Обработка платежа ${paymentId} для заказа ${orderId}`);
    console.log(`📊 Статус платежа в YooKassa: ${payment.status}`);

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

    const updatedPayment = await this.updatePaymentStatus(paymentId, status.toString());
    console.log(`✅ Платеж обработан:`, updatedPayment);
    
    return updatedPayment;
  }

  // Проверка статуса платежа в YooKassa
  async checkPaymentStatus(paymentId: string) {
    const memoryPayment = this.payments.get(paymentId);
    if (!memoryPayment?.yookassaId) {
      return null;
    }

    // Проверяем, используются ли тестовые данные
    const secretKey = this.configService.get('YOOKASSA_SECRET_KEY');
    const isTestMode = secretKey?.startsWith('test_');

    if (isTestMode) {
      // В тестовом режиме просто возвращаем платеж из памяти
      console.log('Using mock payment status check for test mode');
      return memoryPayment;
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

  // Получение информации о платеже из YooKassa
  async getPaymentInfo(paymentId: string) {
    const memoryPayment = this.payments.get(paymentId);
    if (!memoryPayment?.yookassaId) {
      return null;
    }

    // Проверяем, используются ли тестовые данные
    const secretKey = this.configService.get('YOOKASSA_SECRET_KEY');
    const isTestMode = secretKey?.startsWith('test_');

    if (isTestMode) {
      // В тестовом режиме возвращаем mock данные
      console.log('Using mock payment info for test mode');
      return {
        id: memoryPayment.yookassaId,
        status: memoryPayment.status,
        amount: {
          value: memoryPayment.amount.toString(),
          currency: 'RUB',
        },
        description: `Оплата заказа №${memoryPayment.orderId}`,
        test: true,
        paid: memoryPayment.status === 'paid',
        metadata: {
          orderId: memoryPayment.orderId,
          paymentId: memoryPayment.id,
        },
      };
    }

    try {
      // Получаем список платежей и ищем нужный
      const payments = await this.yookassaService.getPayments(100);
      const paymentInfo = payments.find(
        (p) => p.id === memoryPayment.yookassaId,
      );

      if (paymentInfo) {
        return paymentInfo;
      }

      return memoryPayment;
    } catch (error) {
      console.error('Ошибка получения информации о платеже:', error);
      return memoryPayment;
    }
  }

  // Подтверждение платежа (для отложенных платежей)
  async confirmPayment(paymentId: string, amount?: number) {
    const memoryPayment = this.payments.get(paymentId);
    if (!memoryPayment?.yookassaId) {
      throw new Error('Платеж не найден');
    }

    // Проверяем, используются ли тестовые данные
    const secretKey = this.configService.get('YOOKASSA_SECRET_KEY');
    const isTestMode = secretKey?.startsWith('test_');

    if (isTestMode) {
      // В тестовом режиме просто обновляем статус
      console.log('Using mock payment confirmation for test mode');
      memoryPayment.status = 'paid';
      this.payments.set(paymentId, memoryPayment);
      return memoryPayment;
    }

    // TODO: Реализовать когда в nestjs-yookassa появится метод confirmPayment
    // Пока используем заглушку
    console.warn('Метод confirmPayment пока не реализован в nestjs-yookassa');
    throw new Error('Подтверждение платежа временно недоступно');
  }

  // Отмена платежа
  async cancelPayment(paymentId: string) {
    const memoryPayment = this.payments.get(paymentId);
    if (!memoryPayment?.yookassaId) {
      throw new Error('Платеж не найден');
    }

    // Проверяем, используются ли тестовые данные
    const secretKey = this.configService.get('YOOKASSA_SECRET_KEY');
    const isTestMode = secretKey?.startsWith('test_');

    if (isTestMode) {
      // В тестовом режиме просто обновляем статус
      console.log('Using mock payment cancellation for test mode');
      memoryPayment.status = 'canceled';
      this.payments.set(paymentId, memoryPayment);
      return memoryPayment;
    }

    // TODO: Реализовать когда в nestjs-yookassa появится метод cancelPayment
    // Пока используем заглушку
    console.warn('Метод cancelPayment пока не реализован в nestjs-yookassa');
    throw new Error('Отмена платежа временно недоступна');
  }

  // Получение всех платежей (для админки)
  getAllPayments() {
    return Array.from(this.payments.values());
  }
}
