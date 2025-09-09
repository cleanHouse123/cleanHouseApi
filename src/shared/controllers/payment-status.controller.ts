import {
  Controller,
  Get,
  Param,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Public } from '../decorators/public.decorator';
import { PaymentInfoDto } from '../dto/payment-info.dto';
import { PaymentService } from '../../subscription/services/payment.service';
import { OrderPaymentService } from '../../order/services/order-payment.service';

@ApiTags('Payment Status')
@Controller('payment-status')
@Public()
export class PaymentStatusController {
  constructor(
    private readonly subscriptionPaymentService: PaymentService,
    private readonly orderPaymentService: OrderPaymentService,
  ) {}

  @Get(':paymentId')
  @ApiOperation({
    summary: 'Проверить статус платежа по ID',
    description:
      'Универсальный эндпоинт для проверки статуса платежа подписки или заказа по ID платежа',
  })
  @ApiParam({
    name: 'paymentId',
    description: 'ID платежа',
    example: '34f5753f-e8d8-4adf-b7dd-f319054de6fc',
  })
  @ApiResponse({
    status: 200,
    description: 'Статус платежа найден',
    type: PaymentInfoDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Платеж не найден',
  })
  @ApiResponse({
    status: 400,
    description: 'Неверный формат ID платежа',
  })
  async getPaymentStatus(
    @Param('paymentId') paymentId: string,
  ): Promise<PaymentInfoDto> {
    // Валидация UUID
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(paymentId)) {
      throw new BadRequestException('Неверный формат ID платежа');
    }

    try {
      console.log(`🔍 Поиск платежа: ${paymentId}`);

      // Сначала проверяем в подписках
      const subscriptionPayment =
        await this.subscriptionPaymentService.getPayment(paymentId);
      console.log(`📋 Результат поиска в подписках:`, subscriptionPayment);

      if (subscriptionPayment) {
        console.log(`✅ Платеж найден в подписках`);
        return {
          id: subscriptionPayment.id,
          subscriptionId: subscriptionPayment.subscriptionId,
          amount: subscriptionPayment.amount,
          status: subscriptionPayment.status,
          createdAt: subscriptionPayment.createdAt,
          updatedAt: subscriptionPayment.updatedAt,
          paidAt: subscriptionPayment.paidAt,
        };
      }

      // Затем проверяем в заказах
      const orderPayment = await this.orderPaymentService.getPayment(paymentId);
      console.log(`📦 Результат поиска в заказах:`, orderPayment);

      if (orderPayment) {
        console.log(`✅ Платеж найден в заказах`);
        return {
          id: orderPayment.id,
          orderId: orderPayment.orderId,
          amount: orderPayment.amount,
          status: orderPayment.status,
          createdAt: orderPayment.createdAt,
          updatedAt: orderPayment.updatedAt,
          paidAt: orderPayment.paidAt,
        };
      }

      // Если платеж не найден ни в подписках, ни в заказах
      console.log(`❌ Платеж не найден ни в подписках, ни в заказах`);
      throw new NotFoundException('Платеж не найден');
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      // Логируем ошибку и возвращаем общую ошибку
      console.error('Error checking payment status:', error);
      throw new NotFoundException('Ошибка при проверке статуса платежа');
    }
  }

  @Get(':paymentId/type')
  @ApiOperation({
    summary: 'Определить тип платежа по ID',
    description:
      'Возвращает тип платежа (subscription или order) по ID платежа',
  })
  @ApiParam({
    name: 'paymentId',
    description: 'ID платежа',
    example: '34f5753f-e8d8-4adf-b7dd-f319054de6fc',
  })
  @ApiResponse({
    status: 200,
    description: 'Тип платежа определен',
    schema: {
      type: 'object',
      properties: {
        paymentId: { type: 'string' },
        type: { type: 'string', enum: ['subscription', 'order'] },
        exists: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Платеж не найден',
  })
  async getPaymentType(@Param('paymentId') paymentId: string) {
    // Валидация UUID
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(paymentId)) {
      throw new BadRequestException('Неверный формат ID платежа');
    }

    try {
      // Проверяем в подписках
      const subscriptionPayment =
        await this.subscriptionPaymentService.getPayment(paymentId);
      if (subscriptionPayment) {
        return {
          paymentId,
          type: 'subscription',
          exists: true,
        };
      }

      // Проверяем в заказах
      const orderPayment = await this.orderPaymentService.getPayment(paymentId);
      if (orderPayment) {
        return {
          paymentId,
          type: 'order',
          exists: true,
        };
      }

      return {
        paymentId,
        type: null,
        exists: false,
      };
    } catch (error) {
      console.error('Error checking payment type:', error);
      throw new NotFoundException('Ошибка при определении типа платежа');
    }
  }

  @Get('debug/all')
  @ApiOperation({
    summary: 'Получить все платежи (для отладки)',
    description: 'Возвращает все платежи из подписок и заказов для отладки',
  })
  async getAllPayments() {
    const subscriptionPayments =
      await this.subscriptionPaymentService.getAllPaymentIds();
    const orderPayments = await this.orderPaymentService.getAllPayments();

    return {
      subscriptionPayments: subscriptionPayments,
      orderPayments: orderPayments.map((p) => p.id),
      total: subscriptionPayments.length + orderPayments.length,
    };
  }
}
