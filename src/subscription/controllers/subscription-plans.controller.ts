import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { SubscriptionPlansService } from '../services/subscription-plans.service';
import { CreateSubscriptionPlanDto } from '../dto/create-subscription-plan.dto';
import { UpdateSubscriptionPlanDto } from '../dto/update-subscription-plan.dto';
import { SubscriptionPlanResponseDto } from '../dto/subscription-plan-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { SubscriptionService } from '../subscription.service';
import { SubscriptionPlanWithPriceDto } from '../dto/subscription-plan-with-price.dto';
import { GetUserMetadata, UserMetadata } from '../../shared/decorators/get-user.decorator';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Subscription Plans')
@Controller('subscription-plans')
export class SubscriptionPlansController {
  constructor(
    private readonly subscriptionPlansService: SubscriptionPlansService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Get('client/with-prices')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Получить все планы подписок с финальными ценами для текущего пользователя' })
  @ApiResponse({
    status: 200,
    description: 'Список планов подписок с ценами для пользователя',
    type: [SubscriptionPlanWithPriceDto],
  })
  async findAllWithPrices(
    @GetUserMetadata() user: UserMetadata,
  ): Promise<SubscriptionPlanWithPriceDto[]> {
    return this.subscriptionService.getAllPlansWithPrices(user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Получить все планы подписок (публичный, без цен для пользователя)' })
  @ApiResponse({
    status: 200,
    description: 'Список планов подписок',
    type: [SubscriptionPlanResponseDto],
  })
  async findAll(): Promise<SubscriptionPlanResponseDto[]> {
    return this.subscriptionPlansService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить план подписки по ID' })
  @ApiResponse({
    status: 200,
    description: 'План подписки',
    type: SubscriptionPlanResponseDto,
  })
  async findOne(@Param('id') id: string): Promise<SubscriptionPlanResponseDto> {
    return this.subscriptionPlansService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  async create(
    @Body(ValidationPipe) createDto: CreateSubscriptionPlanDto,
  ): Promise<SubscriptionPlanResponseDto> {
    return this.subscriptionPlansService.create(createDto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateDto: UpdateSubscriptionPlanDto,
  ): Promise<SubscriptionPlanResponseDto> {
    return this.subscriptionPlansService.update(id, updateDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async remove(@Param('id') id: string): Promise<{ message: string }> {
    await this.subscriptionPlansService.remove(id);
    return { message: 'Subscription plan deleted successfully' };
  }
}
