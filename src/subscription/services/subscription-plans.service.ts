import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { CreateSubscriptionPlanDto } from '../dto/create-subscription-plan.dto';
import { UpdateSubscriptionPlanDto } from '../dto/update-subscription-plan.dto';
import { SubscriptionPlanResponseDto } from '../dto/subscription-plan-response.dto';

@Injectable()
export class SubscriptionPlansService {
  constructor(
    @InjectRepository(SubscriptionPlan)
    private readonly subscriptionPlanRepository: Repository<SubscriptionPlan>,
  ) {}

  async findAll(): Promise<SubscriptionPlanResponseDto[]> {
    const plans = await this.subscriptionPlanRepository.find({
      order: { createdAt: 'DESC' },
    });
    return plans.map((plan) => new SubscriptionPlanResponseDto(plan));
  }

  async findOne(id: string): Promise<SubscriptionPlanResponseDto> {
    const plan = await this.subscriptionPlanRepository.findOne({
      where: { id },
    });

    if (!plan) {
      throw new NotFoundException(`Subscription plan with ID ${id} not found`);
    }

    return new SubscriptionPlanResponseDto(plan);
  }

  async create(
    createDto: CreateSubscriptionPlanDto,
  ): Promise<SubscriptionPlanResponseDto> {
    const plan = this.subscriptionPlanRepository.create(createDto);
    const savedPlan = await this.subscriptionPlanRepository.save(plan);
    return new SubscriptionPlanResponseDto(savedPlan);
  }

  async update(
    id: string,
    updateDto: UpdateSubscriptionPlanDto,
  ): Promise<SubscriptionPlanResponseDto> {
    const plan = await this.subscriptionPlanRepository.findOne({
      where: { id },
    });

    if (!plan) {
      throw new NotFoundException(`Subscription plan with ID ${id} not found`);
    }

    Object.assign(plan, updateDto);
    const savedPlan = await this.subscriptionPlanRepository.save(plan);
    return new SubscriptionPlanResponseDto(savedPlan);
  }

  async remove(id: string): Promise<void> {
    const result = await this.subscriptionPlanRepository.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException(`Subscription plan with ID ${id} not found`);
    }
  }
}
