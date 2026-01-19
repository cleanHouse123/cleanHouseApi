import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { OrderService } from './order.service';
import { FindOrdersQueryDto } from './dto/find-orders-query.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { FindNearbyOrdersDto } from './dto/find-nearby-orders.dto';
import {
  CreateOrderPaymentDto,
  OrderPaymentResponseDto,
  OrderPaymentCallbackDto,
} from './dto/create-order-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrderStatus } from './entities/order.entity';
import { Public } from '../shared/decorators/public.decorator';
import { OrderPaymentService } from './services/order-payment.service';
import { OrderPaymentGateway } from './gateways/order-payment.gateway';
import { PaymentInfoDto } from '../shared/dto/payment-info.dto';

@ApiTags('orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly orderPaymentService: OrderPaymentService,
    private readonly orderPaymentGateway: OrderPaymentGateway,
  ) {}

  @Post()
  @ApiOperation({
    summary:
      'Создать новый заказ. Если scheduledAt не указан, автоматически устанавливается текущее время + 1 час',
  })
  @ApiResponse({
    status: 201,
    description: 'Заказ успешно создан',
    type: OrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Неверные данные' })
  @ApiResponse({ status: 404, description: 'Клиент не найден' })
  async create(
    @Body() createOrderDto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    return this.orderService.create(createOrderDto);
  }

  @Get()
  @ApiOperation({ summary: 'Получить список заказов' })
  @ApiQuery({
    name: 'isOverdue',
    required: false,
    type: Boolean,
    description: 'Фильтр по просроченным заказам',
  })
  @ApiQuery({
    name: 'customerSearch',
    required: false,
    type: String,
    description: 'Поиск по email, телефону или имени клиента',
  })
  @ApiResponse({
    status: 200,
    description: 'Список заказов',
    schema: {
      type: 'object',
      properties: {
        orders: {
          type: 'array',
          items: { $ref: '#/components/schemas/OrderResponseDto' },
        },
        total: { type: 'number' },
      },
    },
  })
  async findAll(@Query() query: FindOrdersQueryDto) {
    return this.orderService.findAll(query);
  }

  @Get('nearby')
  @ApiOperation({
    summary: 'Получить ближайшие заказы по местоположению (PostGIS)',
  })
  @ApiQuery({
    name: 'lat',
    required: true,
    description: 'Широта местоположения пользователя',
    example: 55.7558,
  })
  @ApiQuery({
    name: 'lon',
    required: true,
    description: 'Долгота местоположения пользователя',
    example: 37.6176,
  })
  @ApiQuery({
    name: 'maxDistance',
    required: false,
    description: 'Максимальное расстояние в метрах',
    example: 5000,
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Номер страницы',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Количество на странице',
    example: 10,
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: OrderStatus,
    description: 'Фильтр по статусу',
  })
  @ApiQuery({
    name: 'currierId',
    required: false,
    description: 'Фильтр по ID курьера',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiQuery({
    name: 'isOverdue',
    required: false,
    type: Boolean,
    description: 'Фильтр по просроченным заказам',
  })
  @ApiQuery({
    name: 'customerSearch',
    required: false,
    type: String,
    description: 'Поиск по email, телефону или имени клиента',
  })
  @ApiResponse({
    status: 200,
    description: 'Список ближайших заказов с расстоянием',
    schema: {
      type: 'object',
      properties: {
        orders: {
          type: 'array',
          items: {
            allOf: [
              { $ref: '#/components/schemas/OrderResponseDto' },
              {
                type: 'object',
                properties: {
                  distance: {
                    type: 'number',
                    description: 'Расстояние в метрах',
                    example: 1234.56,
                  },
                },
              },
            ],
          },
        },
        total: { type: 'number' },
      },
    },
  })
  async findAllNearby(@Query() query: FindNearbyOrdersDto) {
    return this.orderService.findAllNearby(query);
  }

  @Get('customer/:customerId')
  @ApiOperation({ summary: 'Получить заказы клиента' })
  @ApiResponse({
    status: 200,
    description: 'Заказы клиента',
    type: [OrderResponseDto],
  })
  async getOrdersByCustomer(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ): Promise<OrderResponseDto[]> {
    return this.orderService.getOrdersByCustomer(customerId);
  }

  @Get('currier/:currierId')
  @ApiOperation({ summary: 'Получить заказы курьера' })
  @ApiResponse({
    status: 200,
    description: 'Заказы курьера',
    type: [OrderResponseDto],
  })
  async getOrdersByCurrier(
    @Param('currierId', ParseUUIDPipe) currierId: string,
  ): Promise<OrderResponseDto[]> {
    return this.orderService.getOrdersByCurrier(currierId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить заказ по ID' })
  @ApiResponse({
    status: 200,
    description: 'Заказ найден',
    type: OrderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Заказ не найден' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderResponseDto> {
    return this.orderService.findOne(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Обновить статус заказа' })
  @ApiResponse({
    status: 200,
    description: 'Статус заказа обновлен',
    type: OrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Неверный переход статуса' })
  @ApiResponse({ status: 404, description: 'Заказ не найден' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateOrderStatusDto: UpdateOrderStatusDto,
  ): Promise<OrderResponseDto> {
    return this.orderService.updateStatus(id, updateOrderStatusDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить заказ' })
  @ApiResponse({ status: 200, description: 'Заказ удален' })
  @ApiResponse({
    status: 400,
    description: 'Нельзя удалить заказ в процессе выполнения',
  })
  @ApiResponse({ status: 404, description: 'Заказ не найден' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.orderService.remove(id);
  }

  // ==================== COURIER METHODS ====================

  @Patch(':id/take')
  @ApiOperation({
    summary: 'Курьер берет заказ (включая просроченные)',
  })
  @ApiResponse({
    status: 200,
    description: 'Заказ успешно взят курьером',
    type: OrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Заказ уже взят или недоступен' })
  @ApiResponse({ status: 404, description: 'Заказ не найден' })
  async takeOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { courierId: string },
  ): Promise<OrderResponseDto> {
    return this.orderService.takeOrder(id, body.courierId);
  }

  @Patch(':id/start')
  @ApiOperation({ summary: 'Курьер начинает выполнение заказа' })
  @ApiResponse({
    status: 200,
    description: 'Заказ начат к выполнению',
    type: OrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Заказ не может быть начат' })
  @ApiResponse({ status: 404, description: 'Заказ не найден' })
  async startOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { courierId: string },
  ): Promise<OrderResponseDto> {
    return this.orderService.startOrder(id, body.courierId);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Курьер завершает заказ' })
  @ApiResponse({
    status: 200,
    description: 'Заказ успешно завершен',
    type: OrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Заказ не может быть завершен' })
  @ApiResponse({ status: 404, description: 'Заказ не найден' })
  async completeOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { courierId: string },
  ): Promise<OrderResponseDto> {
    return this.orderService.completeOrder(id, body.courierId);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Курьер отменяет заказ' })
  @ApiResponse({
    status: 200,
    description: 'Заказ отменен курьером',
    type: OrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Заказ не может быть отменен' })
  @ApiResponse({ status: 404, description: 'Заказ не найден' })
  async cancelOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { courierId: string; reason?: string },
  ): Promise<OrderResponseDto> {
    return this.orderService.cancelOrder(id, body?.courierId, body?.reason);
  }

  // Эндпоинты для оплаты заказов
  @Post('payment/create')
  @ApiOperation({ summary: 'Создать ссылку на оплату заказа' })
  @ApiResponse({
    status: 201,
    description: 'Ссылка на оплату создана',
    type: OrderPaymentResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Неверные данные' })
  @ApiResponse({ status: 404, description: 'Заказ не найден' })
  async createPaymentLink(
    @Body() createOrderPaymentDto: CreateOrderPaymentDto,
  ): Promise<OrderPaymentResponseDto> {
    return await this.orderPaymentService.createPaymentLink(
      createOrderPaymentDto.orderId,
      createOrderPaymentDto.amount,
      createOrderPaymentDto.customerEmail,
    );
  }

  @Post(':id/create-payment-url')
  @ApiOperation({
    summary: 'Создать ссылку на оплату для существующего заказа',
  })
  @ApiResponse({
    status: 200,
    description: 'Ссылка на оплату создана',
    schema: {
      type: 'object',
      properties: {
        paymentUrl: { type: 'string' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Заказ не найден или уже оплачен' })
  async createPaymentUrlForOrder(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ paymentUrl: string | null; message: string }> {
    const paymentUrl = await this.orderService.createPaymentUrlForOrder(id);

    if (!paymentUrl) {
      return {
        paymentUrl: null,
        message: 'Заказ не найден или уже оплачен',
      };
    }

    return {
      paymentUrl,
      message: 'Ссылка на оплату создана успешно',
    };
  }

  @Post('payment/callback')
  @Public()
  @ApiOperation({ summary: 'Callback для обработки платежа заказа' })
  @ApiResponse({ status: 200, description: 'Callback обработан успешно' })
  @ApiResponse({ status: 400, description: 'Неверные данные' })
  async handlePaymentCallback(
    @Body() paymentCallbackDto: OrderPaymentCallbackDto,
  ) {
    const payment = await this.orderPaymentService.getPayment(
      paymentCallbackDto.paymentId,
    );

    if (!payment) {
      throw new Error('Платеж не найден');
    }

    // Обновляем статус платежа
    await this.orderPaymentService.updatePaymentStatus(
      paymentCallbackDto.paymentId,
      paymentCallbackDto.status,
    );

    if (paymentCallbackDto.status === 'success') {
      // Проверяем текущий статус заказа перед обновлением
      try {
        const order = await this.orderService.findOne(payment.orderId);
        if (order.status !== OrderStatus.PAID) {
          // Обновляем статус заказа на "оплачен"
          await this.orderService.updateStatus(payment.orderId, {
            status: OrderStatus.PAID,
          });
        }
      } catch (error) {
        console.error(
          `Ошибка обновления статуса заказа ${payment.orderId}:`,
          error.message,
        );
      }

      // Отправляем уведомление через WebSocket
      this.orderPaymentGateway.notifyPaymentSuccess(
        paymentCallbackDto.paymentId,
        payment.orderId,
      );
    } else {
      // Отправляем уведомление об ошибке
      this.orderPaymentGateway.notifyPaymentError(
        paymentCallbackDto.paymentId,
        payment.orderId,
        'Ошибка оплаты заказа',
      );
    }

    return { message: 'Callback обработан успешно' };
  }

  @Post('payment/yookassa-webhook')
  @Public()
  @ApiOperation({ summary: 'Webhook для YooKassa платежей заказов' })
  @ApiResponse({ status: 200, description: 'Webhook обработан успешно' })
  async handleYookassaWebhook(@Body() webhookData: any) {
    try {
      const payment =
        await this.orderPaymentService.handleYookassaWebhook(webhookData);

      if (payment && payment.status === 'paid') {
        try {
          // Проверяем текущий статус заказа перед обновлением
          const order = await this.orderService.findOne(payment.orderId);
          if (order.status !== OrderStatus.PAID) {
            // Обновляем статус заказа на "оплачен"
            await this.orderService.updateStatus(payment.orderId, {
              status: OrderStatus.PAID,
            });
          } else {
            console.log(
              `Заказ ${payment.orderId} уже оплачен, пропускаем обновление статуса`,
            );
          }
        } catch (error) {
          // Если заказ не найден или другая ошибка - логируем
          console.error(
            `Ошибка обновления статуса заказа ${payment.orderId}:`,
            error.message,
          );
        }

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

      return { message: 'Webhook обработан успешно' };
    } catch (error) {
      console.error('Ошибка обработки webhook:', error);
      return { message: 'Ошибка обработки webhook', error: error.message };
    }
  }

  @Get('payment/status/:paymentId')
  @Public()
  @ApiOperation({ summary: 'Проверка статуса платежа заказа' })
  @ApiResponse({ status: 200, description: 'Статус платежа получен' })
  async checkPaymentStatus(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    const payment =
      await this.orderPaymentService.checkPaymentStatus(paymentId);
    return payment || { message: 'Платеж не найден' };
  }

  @Get('payment/info/:paymentId')
  @Public()
  @ApiOperation({ summary: 'Получение подробной информации о платеже' })
  @ApiResponse({ status: 200, description: 'Информация о платеже получена' })
  async getPaymentInfo(@Param('paymentId', ParseUUIDPipe) paymentId: string) {
    const paymentInfo =
      await this.orderPaymentService.getPaymentInfo(paymentId);
    return paymentInfo || { message: 'Платеж не найден' };
  }

  @Post('payment/return/:paymentId')
  @Public()
  @ApiOperation({ summary: 'Обработка возврата с фронтенда после оплаты' })
  @ApiResponse({ status: 200, description: 'Возврат обработан успешно' })
  async handlePaymentReturn(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    try {
      // Проверяем существование платежа
      const payment = await this.orderPaymentService.getPayment(paymentId);

      if (!payment) {
        return { success: false, message: 'Платеж не найден' };
      }

      // Если платеж еще в статусе pending, помечаем как успешный
      if (payment.status === 'pending') {
        await this.orderPaymentService.simulateSuccessfulPayment(paymentId);

        // Обновляем статус заказа
        try {
          const order = await this.orderService.findOne(payment.orderId);
          if (order.status !== OrderStatus.PAID) {
            await this.orderService.updateStatus(payment.orderId, {
              status: OrderStatus.PAID,
            });
          }
        } catch (error) {
          console.log('Заказ не найден, но платеж обработан:', error.message);
        }

        // Отправляем WebSocket уведомление
        this.orderPaymentGateway.notifyPaymentSuccess(
          paymentId,
          payment.orderId,
        );
      }

      return {
        success: true,
        message: 'Платеж успешно обработан',
        payment: {
          id: paymentId,
          status: 'paid',
          orderId: payment.orderId,
          amount: payment.amount,
        },
      };
    } catch (error) {
      console.error('Ошибка обработки возврата платежа:', error);
      return {
        success: false,
        message: 'Ошибка обработки платежа',
        error: error.message,
      };
    }
  }

  @Post('payment/confirm/:paymentId')
  @Public()
  @ApiOperation({ summary: 'Подтверждение платежа (для отложенных платежей)' })
  @ApiResponse({ status: 200, description: 'Платеж подтвержден' })
  async confirmPayment(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() body?: { amount?: number },
  ) {
    try {
      const confirmedPayment = await this.orderPaymentService.confirmPayment(
        paymentId,
        body?.amount,
      );
      return confirmedPayment;
    } catch (error) {
      return { message: 'Ошибка подтверждения платежа', error: error.message };
    }
  }

  @Post('payment/cancel/:paymentId')
  @Public()
  @ApiOperation({ summary: 'Отмена платежа' })
  @ApiResponse({ status: 200, description: 'Платеж отменен' })
  async cancelPayment(@Param('paymentId', ParseUUIDPipe) paymentId: string) {
    try {
      const canceledPayment =
        await this.orderPaymentService.cancelPayment(paymentId);
      return canceledPayment;
    } catch (error) {
      return { message: 'Ошибка отмены платежа', error: error.message };
    }
  }

  @Post('payment/simulate/:paymentId')
  @Public()
  @ApiOperation({
    summary: 'Симуляция успешной оплаты заказа (для тестирования)',
  })
  @ApiResponse({
    status: 200,
    description: 'Оплата заказа симулирована успешно',
  })
  @ApiResponse({ status: 404, description: 'Платеж не найден' })
  async simulateOrderPayment(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    try {
      const payment =
        await this.orderPaymentService.simulateSuccessfulPayment(paymentId);

      if (!payment) {
        throw new Error('Платеж не найден или уже обработан');
      }

      // Обновляем статус заказа (если он существует)
      try {
        const order = await this.orderService.findOne(payment.orderId);
        if (order.status !== OrderStatus.PAID) {
          await this.orderService.updateStatus(payment.orderId, {
            status: OrderStatus.PAID,
          });
        }
      } catch (error) {
        console.log('Заказ не найден, но платеж обработан:', error.message);
      }

      // Отправляем уведомление через WebSocket
      this.orderPaymentGateway.notifyPaymentSuccess(
        payment.orderId,
        payment.orderId,
      );

      return {
        message: 'Оплата заказа симулирована успешно',
        payment: {
          id: payment.id,
          orderId: payment.orderId,
          amount: payment.amount,
          status: payment.status,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
          paidAt: payment.paidAt,
        },
      };
    } catch (error) {
      console.error('Ошибка при симуляции платежа заказа:', error);
      throw error;
    }
  }

  @Get('payment/:paymentId')
  @ApiOperation({ summary: 'Получить информацию о платеже заказа' })
  @ApiResponse({
    status: 200,
    description: 'Информация о платеже',
    type: PaymentInfoDto,
  })
  @ApiResponse({ status: 404, description: 'Платеж не найден' })
  async getOrderPayment(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ): Promise<PaymentInfoDto> {
    const payment = await this.orderPaymentService.getPayment(paymentId);
    if (!payment) {
      throw new Error('Платеж не найден');
    }
    return {
      id: payment.id,
      orderId: payment.orderId,
      amount: payment.amount,
      status: payment.status,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      paidAt: payment.paidAt,
    };
  }
}
