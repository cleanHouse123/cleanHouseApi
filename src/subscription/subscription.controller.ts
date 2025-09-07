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
import { SubscriptionService } from './subscription.service';
import {
  CreateSubscriptionDto,
  UpdateSubscriptionStatusDto,
} from './dto/subscription.dto';
import { SubscriptionResponseDto } from './dto/subscription-response.dto';
import {
  CreatePaymentDto,
  SubscriptionPaymentResponseDto,
  PaymentCallbackDto,
} from './dto/create-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionStatus } from './entities/subscription.entity';
import { PaymentService } from './services/payment.service';
import { PaymentGateway } from './gateways/payment.gateway';

@ApiTags('Subscriptions')
@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
export class SubscriptionController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly paymentService: PaymentService,
    private readonly paymentGateway: PaymentGateway,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Создать новую подписку' })
  @ApiResponse({
    status: 201,
    description: 'Подписка успешно создана',
    type: SubscriptionResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Неверные данные' })
  @ApiResponse({ status: 404, description: 'Пользователь не найден' })
  async create(
    @Body() createSubscriptionDto: CreateSubscriptionDto,
  ): Promise<SubscriptionResponseDto> {
    return this.subscriptionService.create(createSubscriptionDto);
  }

  @Get()
  @ApiOperation({ summary: 'Получить список подписок' })
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
    enum: SubscriptionStatus,
    description: 'Фильтр по статусу',
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'Фильтр по пользователю',
  })
  @ApiResponse({
    status: 200,
    description: 'Список подписок',
    schema: {
      type: 'object',
      properties: {
        subscriptions: {
          type: 'array',
          items: { $ref: '#/components/schemas/SubscriptionResponseDto' },
        },
        total: { type: 'number' },
      },
    },
  })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: SubscriptionStatus,
    @Query('userId') userId?: string,
  ) {
    return this.subscriptionService.findAll(page, limit, status, userId);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Получить активную подписку пользователя' })
  @ApiResponse({
    status: 200,
    description: 'Активная подписка пользователя',
    type: SubscriptionResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Активная подписка не найдена' })
  async getUserActiveSubscription(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<SubscriptionResponseDto | null> {
    return this.subscriptionService.getUserActiveSubscription(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить подписку по ID' })
  @ApiResponse({
    status: 200,
    description: 'Подписка найдена',
    type: SubscriptionResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Подписка не найдена' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SubscriptionResponseDto> {
    return this.subscriptionService.findOne(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Обновить статус подписки' })
  @ApiResponse({
    status: 200,
    description: 'Статус подписки обновлен',
    type: SubscriptionResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Неверные данные' })
  @ApiResponse({ status: 404, description: 'Подписка не найдена' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateSubscriptionStatusDto: UpdateSubscriptionStatusDto,
  ): Promise<SubscriptionResponseDto> {
    return this.subscriptionService.updateStatus(
      id,
      updateSubscriptionStatusDto,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить подписку' })
  @ApiResponse({ status: 200, description: 'Подписка удалена' })
  @ApiResponse({ status: 404, description: 'Подписка не найдена' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.subscriptionService.remove(id);
  }

  // ==================== PAYMENT ENDPOINTS ====================

  @Post('payment/create')
  @ApiOperation({ summary: 'Создать ссылку на оплату подписки' })
  @ApiResponse({
    status: 201,
    description: 'Ссылка на оплату создана',
    type: SubscriptionPaymentResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Неверные данные' })
  @ApiResponse({ status: 404, description: 'Подписка не найдена' })
  async createPaymentLink(
    @Body() createPaymentDto: CreatePaymentDto,
  ): Promise<SubscriptionPaymentResponseDto> {
    const subscription = await this.subscriptionService.findOne(
      createPaymentDto.subscriptionId,
    );

    if (!subscription) {
      throw new Error('Подписка не найдена');
    }

    return this.paymentService.createPaymentLink(
      createPaymentDto.subscriptionId,
      createPaymentDto.amount,
      createPaymentDto.subscriptionType,
    );
  }

  @Post('payment/callback')
  @ApiOperation({ summary: 'Обработка callback от платежной системы' })
  @ApiResponse({
    status: 200,
    description: 'Callback обработан успешно',
  })
  @ApiResponse({ status: 400, description: 'Неверные данные' })
  async handlePaymentCallback(@Body() paymentCallbackDto: PaymentCallbackDto) {
    const payment = this.paymentService.getPayment(
      paymentCallbackDto.paymentId,
    );

    if (!payment) {
      throw new Error('Платеж не найден');
    }

    // Обновляем статус платежа
    this.paymentService.updatePaymentStatus(
      paymentCallbackDto.paymentId,
      paymentCallbackDto.status,
    );

    if (paymentCallbackDto.status === 'success') {
      // Активируем подписку
      await this.subscriptionService.updateStatus(payment.subscriptionId, {
        status: SubscriptionStatus.ACTIVE,
      });

      // Отправляем уведомление через WebSocket
      this.paymentGateway.notifyPaymentSuccess(
        payment.subscriptionId,
        payment.subscriptionId,
      );
    } else {
      // Отправляем уведомление об ошибке
      this.paymentGateway.notifyPaymentError(
        payment.subscriptionId,
        payment.subscriptionId,
        'Ошибка оплаты',
      );
    }

    return { message: 'Callback обработан успешно' };
  }

  @Post('payment/simulate/:paymentId')
  @ApiOperation({ summary: 'Симуляция успешной оплаты (для тестирования)' })
  @ApiResponse({
    status: 200,
    description: 'Оплата симулирована успешно',
  })
  @ApiResponse({ status: 404, description: 'Платеж не найден' })
  async simulatePayment(@Param('paymentId') paymentId: string) {
    const payment = this.paymentService.simulateSuccessfulPayment(paymentId);

    if (!payment) {
      throw new Error('Платеж не найден или уже обработан');
    }

    // Активируем подписку
    await this.subscriptionService.updateStatus(payment.subscriptionId, {
      status: SubscriptionStatus.ACTIVE,
    });

    // Отправляем уведомление через WebSocket
    this.paymentGateway.notifyPaymentSuccess(
      payment.subscriptionId,
      payment.subscriptionId,
    );

    return { message: 'Оплата симулирована успешно', payment };
  }

  @Get('payment/:paymentId')
  @ApiOperation({ summary: 'Получить информацию о платеже' })
  @ApiResponse({
    status: 200,
    description: 'Информация о платеже',
  })
  @ApiResponse({ status: 404, description: 'Платеж не найден' })
  async getPayment(@Param('paymentId') paymentId: string) {
    const payment = this.paymentService.getPayment(paymentId);

    if (!payment) {
      throw new Error('Платеж не найден');
    }

    return payment;
  }
}
