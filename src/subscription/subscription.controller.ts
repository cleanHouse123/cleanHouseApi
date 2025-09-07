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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionStatus } from './entities/subscription.entity';

@ApiTags('Subscriptions')
@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

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
}
