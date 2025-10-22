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
  Request,
  Ip,
  Headers,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Public } from '../shared/decorators/public.decorator';
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
import { PaymentInfoDto } from '../shared/dto/payment-info.dto';

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
    @Request() req,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
  ): Promise<SubscriptionPaymentResponseDto> {
    const userId = req.user?.id;

    if (!userId) {
      throw new BadRequestException('Пользователь не авторизован');
    }

    // Проверяем существование подписки и права доступа
    const subscription = await this.subscriptionService.findOne(
      createPaymentDto.subscriptionId,
      userId,
    );

    if (!subscription) {
      throw new NotFoundException('Подписка не найдена');
    }

    return await this.paymentService.createPaymentLink(
      createPaymentDto.subscriptionId,
      createPaymentDto.amount,
      createPaymentDto.subscriptionType,
      createPaymentDto.planId,
      userId,
      ipAddress,
      userAgent,
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
    const payment = await this.paymentService.getPayment(
      paymentCallbackDto.paymentId,
    );

    if (!payment) {
      throw new NotFoundException('Платеж не найден');
    }

    // Обновляем статус платежа
    await this.paymentService.updatePaymentStatus(
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
        paymentCallbackDto.paymentId,
        payment.subscriptionId,
      );
    } else {
      // Отправляем уведомление об ошибке
      this.paymentGateway.notifyPaymentError(
        paymentCallbackDto.paymentId,
        payment.subscriptionId,
        'Ошибка оплаты',
      );
    }

    return { message: 'Callback обработан успешно' };
  }

  @Post('payment/yookassa-webhook')
  @Public()
  @ApiOperation({ summary: 'Webhook для YooKassa платежей подписок' })
  @ApiResponse({ status: 200, description: 'Webhook обработан успешно' })
  async handleYookassaWebhook(@Body() webhookData: any) {
    try {
      const payment =
        await this.paymentService.handleYookassaWebhook(webhookData);

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

      return { message: 'Webhook обработан успешно' };
    } catch (error) {
      console.error('Ошибка обработки webhook:', error);
      return { message: 'Ошибка обработки webhook', error: error.message };
    }
  }

  @Get('payment/status/:paymentId')
  @ApiOperation({ summary: 'Проверка статуса платежа подписки' })
  @ApiResponse({ status: 200, description: 'Статус платежа получен' })
  async checkPaymentStatus(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Request() req,
  ) {
    const payment = await this.paymentService.checkPaymentStatus(
      paymentId,
      req.user.id,
    );
    return payment || { message: 'Платеж не найден' };
  }

  @Post('payment/simulate/:paymentId')
  @Public()
  @ApiOperation({ summary: 'Симуляция успешной оплаты (для тестирования)' })
  @ApiResponse({
    status: 200,
    description: 'Оплата симулирована успешно',
  })
  @ApiResponse({ status: 404, description: 'Платеж не найден' })
  async simulatePayment(@Param('paymentId', ParseUUIDPipe) paymentId: string) {
    try {
      const payment =
        await this.paymentService.simulateSuccessfulPayment(paymentId);

      if (!payment) {
        throw new NotFoundException('Платеж не найден или уже обработан');
      }

      // Активируем подписку (если она существует)
      try {
        await this.subscriptionService.updateStatus(payment.subscriptionId, {
          status: SubscriptionStatus.ACTIVE,
        });
      } catch (error) {
        console.log('Подписка не найдена, но платеж обработан:', error.message);
      }

      // Отправляем уведомление через WebSocket
      this.paymentGateway.notifyPaymentSuccess(
        payment.subscriptionId,
        payment.subscriptionId,
      );

      return {
        message: 'Оплата симулирована успешно',
        payment: {
          id: payment.id,
          subscriptionId: payment.subscriptionId,
          amount: payment.amount,
          status: payment.status,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
          paidAt: payment.paidAt,
        },
      };
    } catch (error) {
      console.error('Ошибка при симуляции платежа:', error);
      throw error;
    }
  }

  @Get('payment/:paymentId')
  @ApiOperation({ summary: 'Получить информацию о платеже' })
  @ApiResponse({
    status: 200,
    description: 'Информация о платеже',
    type: PaymentInfoDto,
  })
  @ApiResponse({ status: 404, description: 'Платеж не найден' })
  async getPayment(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ): Promise<PaymentInfoDto> {
    const payment = await this.paymentService.getPayment(paymentId);

    if (!payment) {
      throw new NotFoundException('Платеж не найден');
    }

    return {
      id: payment.id,
      subscriptionId: payment.subscriptionId,
      amount: payment.amount,
      status: payment.status,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      paidAt: payment.paidAt,
    };
  }
}
