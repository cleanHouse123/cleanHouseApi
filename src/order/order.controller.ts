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
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderResponseDto } from './dto/order-response.dto';
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
  @ApiOperation({ summary: 'Создать новый заказ (фиксированная цена 200 руб)' })
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
    name: 'customerId',
    required: false,
    description: 'Фильтр по клиенту',
  })
  @ApiQuery({
    name: 'currierId',
    required: false,
    description: 'Фильтр по курьеру',
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
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: OrderStatus,
    @Query('customerId') customerId?: string,
    @Query('currierId') currierId?: string,
  ) {
    return this.orderService.findAll(
      page,
      limit,
      status,
      customerId,
      currierId,
    );
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
  @ApiOperation({ summary: 'Курьер берет заказ' })
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
    const order = await this.orderService.findOne(
      createOrderPaymentDto.orderId,
    );
    if (!order) {
      throw new Error('Заказ не найден');
    }

    return await this.orderPaymentService.createPaymentLink(
      createOrderPaymentDto.orderId,
      createOrderPaymentDto.amount,
    );
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
      // Обновляем статус заказа на "оплачен"
      await this.orderService.updateStatus(payment.orderId, {
        status: OrderStatus.PAID,
      });

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
  async simulateOrderPayment(@Param('paymentId') paymentId: string) {
    try {
      const payment =
        await this.orderPaymentService.simulateSuccessfulPayment(paymentId);

      if (!payment) {
        throw new Error('Платеж не найден или уже обработан');
      }

      // Обновляем статус заказа (если он существует)
      try {
        await this.orderService.updateStatus(payment.orderId, {
          status: OrderStatus.PAID,
        });
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
    @Param('paymentId') paymentId: string,
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
