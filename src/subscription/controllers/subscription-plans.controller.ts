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

@Controller('subscription-plans')
export class SubscriptionPlansController {
  constructor(
    private readonly subscriptionPlansService: SubscriptionPlansService,
  ) {}

  @Get()
  async findAll(): Promise<SubscriptionPlanResponseDto[]> {
    return this.subscriptionPlansService.findAll();
  }

  @Get(':id')
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
