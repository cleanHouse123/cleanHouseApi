import { Controller, Post, Body, Logger, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../decorators/public.decorator';
import { OrderPaymentService } from '../../order/services/order-payment.service';
import { PaymentService } from '../../subscription/services/payment.service';
import { OrderService } from '../../order/order.service';
import { SubscriptionService } from '../../subscription/subscription.service';
import { OrderPaymentGateway } from '../../order/gateways/order-payment.gateway';
import { PaymentGateway } from '../../subscription/gateways/payment.gateway';
import { OrderStatus } from '../../order/entities/order.entity';
import { PaymentStatus } from '../../order/entities/payment.entity';
import { SubscriptionStatus } from '../../subscription/entities/subscription.entity';
import { SubscriptionPaymentStatus } from '../../subscription/entities/subscription-payment.entity';
import { FcmService } from '../../fcm/fcm.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull, ArrayContains } from 'typeorm';
import { Order } from '../../order/entities/order.entity';
import { User } from '../../user/entities/user.entity';
import { UserRole } from '../types/user.role';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly orderPaymentService: OrderPaymentService,
    private readonly subscriptionPaymentService: PaymentService,
    private readonly orderService: OrderService,
    private readonly subscriptionService: SubscriptionService,
    private readonly orderPaymentGateway: OrderPaymentGateway,
    private readonly paymentGateway: PaymentGateway,
    private readonly fcmService: FcmService,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  @Post('test')
  @Public()
  @ApiOperation({ summary: 'Тестовый webhook endpoint' })
  async testWebhook(@Body() data: any) {
    this.logger.log('=== TEST WEBHOOK RECEIVED ===');
    this.logger.log('Test data:', JSON.stringify(data, null, 2));
    return {
      message: 'Test webhook received successfully',
      timestamp: new Date(),
    };
  }

  @Post('manual-success/:paymentId')
  @Public()
  @ApiOperation({
    summary: 'Ручное обновление статуса платежа для тестирования',
  })
  async manualSuccess(@Param('paymentId') paymentId: string) {
    this.logger.log(`=== MANUAL SUCCESS FOR PAYMENT: ${paymentId} ===`);

    // Имитируем webhook от YooKassa
    const mockWebhook = {
      type: 'payment.succeeded',
      event: 'payment.succeeded',
      object: {
        id: 'mock-yookassa-id',
        status: 'succeeded',
        metadata: {
          paymentId,
          subscriptionId: 'test-subscription-id',
        },
      },
    };

    try {
      const result = await this.handleYookassaWebhook(mockWebhook);
      return { message: 'Manual success processed', result };
    } catch (error) {
      this.logger.error('Manual success error:', error);
      return { message: 'Manual success failed', error: error.message };
    }
  }

  @Post('yookassa')
  @Public()
  @ApiOperation({ summary: 'Универсальный webhook для всех YooKassa платежей' })
  @ApiResponse({ status: 200, description: 'Webhook обработан успешно' })
  async handleYookassaWebhook(@Body() webhookData: any) {
    this.logger.log('=== YOOKASSA WEBHOOK RECEIVED ===');
    this.logger.log('Webhook body:', JSON.stringify(webhookData, null, 2));
    try {
      const eventType = webhookData.event || webhookData.type;
      this.logger.log(`Получен webhook от YooKassa: ${eventType}`);
      this.logger.log('Данные webhook:', JSON.stringify(webhookData, null, 2));

      // Обрабатываем разные типы событий
      switch (eventType) {
        case 'payment.succeeded':
          return await this.handlePaymentSucceeded(webhookData);

        case 'payment.waiting_for_capture':
          return await this.handlePaymentWaitingForCapture(webhookData);

        case 'payment.canceled':
          return await this.handlePaymentCanceled(webhookData);

        case 'refund.succeeded':
          return await this.handleRefundSucceeded(webhookData);

        default:
          this.logger.warn(`Неизвестный тип события: ${eventType}`);
          return {
            message: 'Неизвестный тип события',
            eventType,
            processed: false,
          };
      }
    } catch (error) {
      this.logger.error('Ошибка обработки webhook:', error);
      return { message: 'Ошибка обработки webhook', error: error.message };
    }
  }

  private async handlePaymentSucceeded(webhookData: any) {
    this.logger.log('Обрабатываем успешный платеж');
    return await this.processPaymentEvent(webhookData, 'succeeded');
  }

  private async handlePaymentWaitingForCapture(webhookData: any) {
    this.logger.log(
      'Обрабатываем платеж, ожидающий подтверждения (payment.waiting_for_capture)',
    );

    const { object: payment } = webhookData;
    const metadata = payment.metadata || {};

    // Обновляем статус платежа на "ожидает подтверждения"
    if (metadata.orderId && metadata.paymentId) {
      await this.orderPaymentService.updatePaymentStatus(
        metadata.paymentId,
        'waiting_for_capture',
      );

      // Уведомляем через WebSocket
      this.orderPaymentGateway.notifyPaymentSuccess(
        metadata.paymentId,
        metadata.orderId,
      );
    } else if (metadata.subscriptionId && metadata.paymentId) {
      await this.subscriptionPaymentService.updatePaymentStatus(
        metadata.paymentId,
        SubscriptionPaymentStatus.PROCESSING,
      );

      // Уведомляем через WebSocket (пока используем заглушку)
      this.logger.log(
        `Уведомление о статусе подписки: ${metadata.paymentId} - waiting_for_capture`,
      );
    }

    return await this.processPaymentEvent(webhookData, 'waiting_for_capture');
  }

  private async handlePaymentCanceled(webhookData: any) {
    this.logger.log('Обрабатываем отмененный платеж (payment.canceled)');

    const { object: payment } = webhookData;
    const metadata = payment.metadata || {};

    // Обновляем статус платежа на "отменен"
    if (metadata.orderId && metadata.paymentId) {
      await this.orderPaymentService.updatePaymentStatus(
        metadata.paymentId,
        'canceled',
      );

      // Пытаемся обновить статус заказа (если возможно)
      try {
        await this.orderService.updateStatus(metadata.orderId, {
          status: OrderStatus.CANCELED,
        });
      } catch (error) {
        this.logger.warn(
          `Не удалось обновить статус заказа ${metadata.orderId}: ${error.message}`,
        );
      }

      // Уведомляем через WebSocket
      this.orderPaymentGateway.notifyPaymentError(
        metadata.paymentId,
        metadata.orderId,
        'Платеж отменен',
      );
    } else if (metadata.subscriptionId && metadata.paymentId) {
      await this.subscriptionPaymentService.updatePaymentStatus(
        metadata.paymentId,
        SubscriptionPaymentStatus.FAILED,
      );

      // Уведомляем через WebSocket (пока используем заглушку)
      this.logger.log(
        `Уведомление об ошибке подписки: ${metadata.paymentId} - canceled`,
      );
    }

    return await this.processPaymentEvent(webhookData, 'canceled');
  }

  private async handleRefundSucceeded(webhookData: any) {
    this.logger.log('Обрабатываем успешный возврат (refund.succeeded)');

    const { object: refund } = webhookData;
    const paymentId = refund.payment_id;

    if (paymentId) {
      // Ищем платеж по YooKassa ID для определения типа
      try {
        const orderPayment =
          await this.orderPaymentService.findByYookassaId(paymentId);
        if (orderPayment) {
          await this.orderPaymentService.updatePaymentStatus(
            orderPayment.id,
            'refunded',
          );

          this.orderPaymentGateway.notifyPaymentError(
            orderPayment.id,
            orderPayment.orderId,
            'Платеж возвращен',
          );

          return {
            message: 'Возврат заказа обработан успешно',
            type: 'order_refund',
            paymentId: orderPayment.id,
            refundId: refund.id,
          };
        }

        const subscriptionPayment =
          await this.subscriptionPaymentService.findByYookassaId(paymentId);
        if (subscriptionPayment) {
          await this.subscriptionPaymentService.updatePaymentStatus(
            subscriptionPayment.id,
            SubscriptionPaymentStatus.REFUNDED,
          );

          // Уведомляем через WebSocket (пока используем заглушку)
          this.logger.log(
            `Уведомление о возврате подписки: ${subscriptionPayment.id} - refunded`,
          );

          return {
            message: 'Возврат подписки обработан успешно',
            type: 'subscription_refund',
            paymentId: subscriptionPayment.id,
            refundId: refund.id,
          };
        }
      } catch (error) {
        this.logger.error('Ошибка при обработке возврата:', error);
      }
    }

    return {
      message: 'Возврат обработан (платеж не найден в системе)',
      type: 'refund',
      refundId: refund.id,
    };
  }

  private async processPaymentEvent(webhookData: any, eventStatus: string) {
    const { object: payment } = webhookData;
    const metadata = payment.metadata || {};

    this.logger.log(`🔍 Определение типа платежа из metadata:`, metadata);

    // Определяем тип платежа по metadata
    const isOrderPayment =
      metadata.orderId && metadata.paymentId && !metadata.subscriptionId;
    const isSubscriptionPayment = metadata.subscriptionId && metadata.paymentId;

    // Если metadata пустое, пытаемся найти платеж по yookassaId
    if (!isOrderPayment && !isSubscriptionPayment && payment.id) {
      this.logger.log(
        `🔍 Metadata пустое, ищем платеж по yookassaId: ${payment.id}`,
      );

      const orderPayment = await this.orderPaymentService.findByYookassaId(
        payment.id,
      );
      if (orderPayment) {
        this.logger.log(
          `✅ Найден платеж заказа по yookassaId: ${orderPayment.id}`,
        );
        // Создаем правильный webhookData с metadata
        const correctedWebhookData = {
          ...webhookData,
          object: {
            ...payment,
            metadata: {
              orderId: orderPayment.orderId,
              paymentId: orderPayment.id,
            },
          },
        };
        return await this.handleOrderPayment(correctedWebhookData);
      }

      const subscriptionPayment =
        await this.subscriptionPaymentService.findByYookassaId(payment.id);
      if (subscriptionPayment) {
        this.logger.log(
          `✅ Найден платеж подписки по yookassaId: ${subscriptionPayment.id}`,
        );
        const correctedWebhookData = {
          ...webhookData,
          object: {
            ...payment,
            metadata: {
              subscriptionId: subscriptionPayment.subscriptionId,
              paymentId: subscriptionPayment.id,
            },
          },
        };
        return await this.handleSubscriptionPayment(correctedWebhookData);
      }
    }

    if (isOrderPayment) {
      this.logger.log(
        `📦 Обрабатываем платеж заказа: ${metadata.paymentId} (${eventStatus})`,
      );
      return await this.handleOrderPayment(webhookData);
    } else if (isSubscriptionPayment) {
      this.logger.log(
        `💳 Обрабатываем платеж подписки: ${metadata.paymentId} (${eventStatus})`,
      );
      return await this.handleSubscriptionPayment(webhookData);
    } else {
      this.logger.warn('❌ Неизвестный тип платежа в metadata:', metadata);
      return {
        message: 'Неизвестный тип платежа',
        metadata,
        eventStatus,
      };
    }
  }

  private async handleOrderPayment(webhookData: any) {
    try {
      this.logger.log('🔄 Обработка платежа заказа из webhook');
      const payment =
        await this.orderPaymentService.handleYookassaWebhook(webhookData);

      this.logger.log(`📊 Результат обработки платежа:`, {
        paymentId: payment?.id,
        orderId: payment?.orderId,
        status: payment?.status,
      });

      if (
        payment &&
        (payment.status === 'paid' || payment.status === PaymentStatus.PAID)
      ) {
        this.logger.log(
          `✅ Платеж ${payment.id} успешно оплачен, обновляем статус заказа ${payment.orderId}`,
        );
        // Получаем заказ для проверки текущего статуса
        const order = await this.orderRepository.findOne({
          where: { id: payment.orderId },
          relations: ['customer'],
        });

        if (!order) {
          this.logger.warn(
            `Заказ ${payment.orderId} не найден при обработке webhook`,
          );
          return { message: 'Заказ не найден', type: 'order' };
        }

        let orderJustPaid = false;
        try {
          await this.orderService.updateStatus(payment.orderId, {
            status: OrderStatus.PAID,
          });
          orderJustPaid = true;
        } catch (error: any) {
          const msg = error?.response?.message || error?.message || '';
          const alreadyProcessed =
            msg.includes('Невозможно изменить статус с paid на paid') ||
            msg.includes('Невозможно изменить статус с assigned на paid') ||
            msg.includes('Невозможно изменить статус с in_progress на paid') ||
            msg.includes('Невозможно изменить статус с done на paid') ||
            msg.includes('Невозможно изменить статус с canceled на paid');
          if (alreadyProcessed) {
            this.logger.log(
              `Заказ ${payment.orderId} уже обработан (текущий статус ${order.status}), пропускаем обновление`,
            );
          } else {
            throw error;
          }
        }

        this.orderPaymentGateway.notifyPaymentSuccess(
          payment.id,
          payment.orderId,
        );

        if (orderJustPaid) {
          try {
            this.logger.log(
              `[WebhookController] Отправляем push курьерам о новой оплате заказа ${order.id}`,
            );
            await this.notifyCouriersAboutPaidOrder(order);
            this.logger.log(
              `[WebhookController] Push-уведомления отправлены курьерам о первой оплате заказа ${order.id}`,
            );
          } catch (error) {
            this.logger.error(
              `[WebhookController] Ошибка отправки push курьерам: ${error.message}`,
            );
          }
        } else {
          this.logger.log(
            `[WebhookController] Заказ ${payment.orderId} уже в статусе ${order.status}, отправляем push как fallback (запоздавший webhook)`,
          );
          try {
            await this.notifyCouriersAboutPaidOrder(order);
          } catch (error) {
            this.logger.error(
              `[WebhookController] Ошибка fallback push курьерам: ${error.message}`,
            );
          }
        }
      } else if (
        payment &&
        (payment.status === 'failed' || payment.status === PaymentStatus.FAILED)
      ) {
        this.logger.log(
          `❌ Платеж ${payment.id} не прошел, статус: ${payment.status}`,
        );
        // Отправляем уведомление об ошибке
        this.orderPaymentGateway.notifyPaymentError(
          payment.id,
          payment.orderId,
          'Ошибка оплаты заказа',
        );
      } else {
        this.logger.warn(`⚠️ Неизвестный статус платежа: ${payment?.status}`);
      }

      return { message: 'Webhook заказа обработан успешно', type: 'order' };
    } catch (error) {
      this.logger.error('Ошибка обработки webhook заказа:', error);
      throw error;
    }
  }

  private async handleSubscriptionPayment(webhookData: any) {
    try {
      const payment =
        await this.subscriptionPaymentService.handleYookassaWebhook(
          webhookData,
        );

      if (payment && payment.status === SubscriptionPaymentStatus.SUCCESS) {
        try {
          // Активируем подписку (с валидацией внутри updateStatus)
          await this.subscriptionService.updateStatus(payment.subscriptionId, {
            status: SubscriptionStatus.ACTIVE,
          });

          // Отправляем уведомление через WebSocket (пока используем заглушку)
          this.logger.log(
            `Подписка ${payment.subscriptionId} активирована успешно`,
          );
        } catch (error) {
          // Логируем предупреждение, если подписку нельзя активировать
          this.logger.warn(
            `Не удалось активировать подписку ${payment.subscriptionId}: ${error.message}`,
          );
          // Не пробрасываем ошибку дальше, чтобы webhook был обработан
        }
      } else if (
        payment &&
        payment.status === SubscriptionPaymentStatus.FAILED
      ) {
        // Отправляем уведомление об ошибке (пока используем заглушку)
        this.logger.log(`Ошибка оплаты подписки ${payment.subscriptionId}`);
      }

      return {
        message: 'Webhook подписки обработан успешно',
        type: 'subscription',
      };
    } catch (error) {
      this.logger.error('Ошибка обработки webhook подписки:', error);
      throw error;
    }
  }

  /**
   * Отправляет push-уведомления курьерам о том, что заказ оплачен.
   * Если order.currierId задан — только назначенному курьеру (fallback для запоздавшего webhook).
   */
  private async notifyCouriersAboutPaidOrder(order: Order): Promise<void> {
    try {
      const where: any = {
        roles: ArrayContains([UserRole.CURRIER]),
        deviceToken: Not(IsNull()),
        deletedAt: IsNull(),
      };
      if (order.currierId) {
        where.id = order.currierId;
      }
      const couriers = await this.userRepository.find({ where });

      if (couriers.length === 0) {
        this.logger.log(
          `[WebhookController] ${order.currierId ? 'Назначенный курьер' : 'Курьеры'} без device token, push не отправлен`,
        );
        return;
      }

      if (order.currierId) {
        this.logger.log(
          `[WebhookController] Fallback push: заказ ${order.id} уже в работе, отправляем только назначенному курьеру ${couriers[0]?.name || order.currierId}`,
        );
      }

      const priceInRubles = (order.price / 100).toFixed(2);
      const title = 'Новый оплаченный заказ';
      const body = `Заказ оплачен и готов к работе!\nАдрес: ${order.address}\nЦена: ${priceInRubles} ₽`;
      const payload = JSON.stringify({
        orderId: order.id,
        type: 'order_paid_ready',
      });

      // Логируем информацию о роуте навигации
      const navigationRoute = `/(protected)/order-details?orderId=${order.id}`;
      this.logger.log(
        `[WebhookController] 📍 Sending notification with navigation route: ${navigationRoute} for order ${order.id}`,
      );
      this.logger.log(`[WebhookController] Notification payload: ${payload}`);

      const validCouriers = couriers.filter(
        (c) => c.deviceToken && c.deviceToken.trim(),
      );

      if (validCouriers.length === 0) {
        this.logger.log(
          '[WebhookController] No valid device tokens found for couriers',
        );
        return;
      }

      validCouriers.forEach((c) => {
        const tokenPreview = c.deviceToken
          ? `${c.deviceToken.substring(0, 20)}...${c.deviceToken.slice(-10)}`
          : 'отсутствует';
        this.logger.log(
          `[WebhookController] Push заказ ${order.id} оплачен -> курьер ${c.name} (${c.phone || c.id}), token: ${tokenPreview}`,
        );
      });

      const results = await Promise.allSettled(
        validCouriers.map((c) =>
          this.fcmService.sendNotificationToDevice(
            c.deviceToken!,
            title,
            body,
            payload,
          ),
        ),
      );

      validCouriers.forEach((c, i) => {
        const r = results[i];
        const success =
          r?.status === 'fulfilled' &&
          (r as PromiseFulfilledResult<any>).value?.success;
        if (success) {
          this.logger.log(
            `[WebhookController] ✅ Push ОТПРАВЛЕН: заказ ${order.id} оплачен -> курьер ${c.name} (${c.phone || c.id}), messageId: ${(r as PromiseFulfilledResult<any>).value?.messageId}`,
          );
        } else {
          const err =
            r?.status === 'rejected'
              ? r.reason?.message
              : (r as PromiseFulfilledResult<any>)?.value?.error;
          this.logger.warn(
            `[WebhookController] ❌ Push НЕ отправлен: заказ ${order.id} -> курьер ${c.name}: ${err || 'unknown'}`,
          );
        }
      });

      const successCount = results.filter(
        (r) => r.status === 'fulfilled' && r.value.success,
      ).length;
      const failureCount = results.length - successCount;

      this.logger.log(
        `[WebhookController] Итого push по заказу ${order.id}: ${successCount} отправлено, ${failureCount} ошибок`,
      );
    } catch (error) {
      this.logger.error(
        '[WebhookController] Error sending push notifications to couriers about paid order:',
        error,
      );
      // Не пробрасываем ошибку, чтобы не блокировать обработку webhook
    }
  }
}
