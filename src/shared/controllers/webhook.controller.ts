import { Controller, Post, Body, Logger } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../decorators/public.decorator';
import { OrderPaymentService } from '../../order/services/order-payment.service';
import { PaymentService } from '../../subscription/services/payment.service';
import { OrderService } from '../../order/order.service';
import { SubscriptionService } from '../../subscription/subscription.service';
import { OrderPaymentGateway } from '../../order/gateways/order-payment.gateway';
import { PaymentGateway } from '../../subscription/gateways/payment.gateway';
import { OrderStatus } from '../../order/entities/order.entity';
import { SubscriptionStatus } from '../../subscription/entities/subscription.entity';

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
  ) {}

  @Post('yookassa')
  @Public()
  @ApiOperation({ summary: 'Универсальный webhook для всех YooKassa платежей' })
  @ApiResponse({ status: 200, description: 'Webhook обработан успешно' })
  async handleYookassaWebhook(@Body() webhookData: any) {
    try {
      this.logger.log(
        'Получен webhook от YooKassa:',
        JSON.stringify(webhookData, null, 2),
      );

      const { object: payment } = webhookData;
      const metadata = payment.metadata || {};

      // Определяем тип платежа по metadata
      const isOrderPayment =
        metadata.orderId && metadata.paymentId && !metadata.subscriptionId;
      const isSubscriptionPayment =
        metadata.subscriptionId && metadata.paymentId;

      if (isOrderPayment) {
        this.logger.log(`Обрабатываем платеж заказа: ${metadata.paymentId}`);
        return await this.handleOrderPayment(webhookData);
      } else if (isSubscriptionPayment) {
        this.logger.log(`Обрабатываем платеж подписки: ${metadata.paymentId}`);
        return await this.handleSubscriptionPayment(webhookData);
      } else {
        this.logger.warn('Неизвестный тип платежа в metadata:', metadata);
        return { message: 'Неизвестный тип платежа', metadata };
      }
    } catch (error) {
      this.logger.error('Ошибка обработки webhook:', error);
      return { message: 'Ошибка обработки webhook', error: error.message };
    }
  }

  private async handleOrderPayment(webhookData: any) {
    try {
      const payment =
        await this.orderPaymentService.handleYookassaWebhook(webhookData);

      if (payment && payment.status === 'paid') {
        // Обновляем статус заказа на "оплачен"
        await this.orderService.updateStatus(payment.orderId, {
          status: OrderStatus.PAID,
        });

        // Отправляем уведомление через WebSocket
        this.orderPaymentGateway.notifyPaymentSuccess(
          payment.id,
          payment.orderId,
        );
      } else if (payment && payment.status === 'failed') {
        // Отправляем уведомление об ошибке
        this.orderPaymentGateway.notifyPaymentError(
          payment.id,
          payment.orderId,
          'Ошибка оплаты заказа',
        );
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

      if (payment && payment.status === 'success') {
        // Активируем подписку
        await this.subscriptionService.updateStatus(payment.subscriptionId, {
          status: SubscriptionStatus.ACTIVE,
        });

        // Отправляем уведомление через WebSocket
        this.paymentGateway.notifyPaymentSuccess(
          payment.id,
          payment.subscriptionId,
        );
      } else if (payment && payment.status === 'failed') {
        // Отправляем уведомление об ошибке
        this.paymentGateway.notifyPaymentError(
          payment.id,
          payment.subscriptionId,
          'Ошибка оплаты подписки',
        );
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
}
