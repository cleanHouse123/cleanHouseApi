import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import {
  Subscription,
  SubscriptionStatus,
} from './entities/subscription.entity';
import { CreateSubscriptionDto } from './dto/subscription.dto';
import { UpdateSubscriptionStatusDto } from './dto/subscription.dto';
import {
  SubscriptionResponseDto,
  UserResponseDto,
} from './dto/subscription-response.dto';
import { User } from '../user/entities/user.entity';

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async create(
    createSubscriptionDto: CreateSubscriptionDto,
  ): Promise<SubscriptionResponseDto> {
    // Проверяем существование пользователя
    const user = await this.userRepository.findOne({
      where: { id: createSubscriptionDto.userId },
    });

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    // Проверяем, нет ли активной подписки (только ACTIVE, не PENDING)
    const existingActiveSubscription =
      await this.subscriptionRepository.findOne({
        where: {
          userId: createSubscriptionDto.userId,
          status: SubscriptionStatus.ACTIVE,
        },
      });

    if (existingActiveSubscription) {
      throw new BadRequestException(
        'У пользователя уже есть активная подписка',
      );
    }

    // Создаем подписку со статусом PENDING (ожидает оплаты)
    const subscription = this.subscriptionRepository.create({
      userId: createSubscriptionDto.userId,
      type: createSubscriptionDto.type,
      price: createSubscriptionDto.price,
      startDate: new Date(createSubscriptionDto.startDate),
      endDate: new Date(createSubscriptionDto.endDate),
      status: SubscriptionStatus.PENDING,
    });

    const savedSubscription =
      await this.subscriptionRepository.save(subscription);

    return this.findOne(savedSubscription.id);
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    status?: SubscriptionStatus,
    userId?: string,
  ): Promise<{ subscriptions: SubscriptionResponseDto[]; total: number }> {
    const where: FindOptionsWhere<Subscription> = {};

    if (status) {
      where.status = status;
    }

    if (userId) {
      where.userId = userId;
    }

    const [subscriptions, total] =
      await this.subscriptionRepository.findAndCount({
        where,
        relations: ['user'],
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

    return {
      subscriptions: subscriptions.map((subscription) =>
        this.transformToResponseDto(subscription),
      ),
      total,
    };
  }

  async findOne(id: string): Promise<SubscriptionResponseDto> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!subscription) {
      throw new NotFoundException('Подписка не найдена');
    }

    return this.transformToResponseDto(subscription);
  }

  async updateStatus(
    id: string,
    updateSubscriptionStatusDto: UpdateSubscriptionStatusDto,
  ): Promise<SubscriptionResponseDto> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id },
    });

    if (!subscription) {
      throw new NotFoundException('Подписка не найдена');
    }

    subscription.status =
      updateSubscriptionStatusDto.status as SubscriptionStatus;

    if (
      updateSubscriptionStatusDto.status === 'canceled' &&
      updateSubscriptionStatusDto.canceledAt
    ) {
      subscription.canceledAt = new Date(
        updateSubscriptionStatusDto.canceledAt,
      );
    }

    await this.subscriptionRepository.save(subscription);

    return this.findOne(id);
  }

  async getUserActiveSubscription(
    userId: string,
  ): Promise<SubscriptionResponseDto | null> {
    const subscription = await this.subscriptionRepository.findOne({
      where: {
        userId,
        status: SubscriptionStatus.ACTIVE,
      },
      relations: ['user'],
    });

    if (!subscription) {
      return null;
    }

    return this.transformToResponseDto(subscription);
  }

  async checkSubscriptionExpiry(): Promise<void> {
    const expiredSubscriptions = await this.subscriptionRepository.find({
      where: {
        status: SubscriptionStatus.ACTIVE,
      },
    });

    const now = new Date();
    const expiredIds: string[] = [];

    for (const subscription of expiredSubscriptions) {
      if (subscription.endDate < now) {
        expiredIds.push(subscription.id);
      }
    }

    if (expiredIds.length > 0) {
      await this.subscriptionRepository.update(
        { id: expiredIds[0] },
        { status: SubscriptionStatus.EXPIRED },
      );
    }
  }

  async remove(id: string): Promise<void> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id },
    });

    if (!subscription) {
      throw new NotFoundException('Подписка не найдена');
    }

    await this.subscriptionRepository.remove(subscription);
  }

  private transformToResponseDto(
    subscription: Subscription,
  ): SubscriptionResponseDto {
    return {
      id: subscription.id,
      user: {
        id: subscription.user.id,
        name: subscription.user.name,
        phone: subscription.user.phone,
      } as UserResponseDto,
      type: subscription.type,
      status: subscription.status,
      price: subscription.price,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      canceledAt: subscription.canceledAt,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
    };
  }
}
