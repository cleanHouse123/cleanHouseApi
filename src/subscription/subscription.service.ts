import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, DataSource } from 'typeorm';
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
import { AuditService } from './services/audit.service';
import { PaymentAuditAction } from './entities/payment-audit.entity';
import {
  SubscriptionPayment,
  SubscriptionPaymentStatus,
} from './entities/subscription-payment.entity';

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private auditService: AuditService,
    private dataSource: DataSource,
  ) {}

  async create(
    createSubscriptionDto: CreateSubscriptionDto,
    currentUserId?: string,
  ): Promise<SubscriptionResponseDto> {
    return await this.dataSource.transaction(async (manager) => {
      // Проверяем права доступа - пользователь может создавать подписку только для себя
      if (currentUserId && currentUserId !== createSubscriptionDto.userId) {
        throw new ForbiddenException(
          'Нельзя создавать подписку для другого пользователя',
        );
      }

      // Проверяем существование пользователя
      const user = await manager.findOne(User, {
        where: { id: createSubscriptionDto.userId },
      });

      if (!user) {
        throw new NotFoundException('Пользователь не найден');
      }

      // Проверяем, нет ли у пользователя активной подписки (в транзакции)
      const existingActiveSubscription = await manager.findOne(Subscription, {
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

      // Создаем новую подписку
      const subscription = manager.create(Subscription, {
        userId: createSubscriptionDto.userId,
        type: createSubscriptionDto.type,
        price: createSubscriptionDto.price,
        startDate: new Date(createSubscriptionDto.startDate),
        endDate: new Date(createSubscriptionDto.endDate),
        status: SubscriptionStatus.PENDING,
        ordersLimit: createSubscriptionDto.ordersLimit ?? -1,
        usedOrders: createSubscriptionDto.usedOrders ?? 0,
      });

      const savedSubscription = await manager.save(subscription);

      // Логируем создание подписки
      await this.auditService.logPaymentAction(
        PaymentAuditAction.SUBSCRIPTION_ACTIVATED,
        createSubscriptionDto.userId,
        {
          subscriptionId: savedSubscription.id,
          amount: savedSubscription.price,
          metadata: {
            type: savedSubscription.type,
            startDate: savedSubscription.startDate,
            endDate: savedSubscription.endDate,
          },
        },
      );

      return await this.transformToResponseDto(savedSubscription, user);
    });
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    status?: SubscriptionStatus,
    userId?: string,
    currentUserId?: string,
  ): Promise<{ subscriptions: SubscriptionResponseDto[]; total: number }> {
    const where: FindOptionsWhere<Subscription> = {};

    if (status) {
      where.status = status;
    }

    // Пользователи могут видеть только свои подписки
    if (currentUserId) {
      where.userId = currentUserId;
    } else if (userId) {
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

    const subscriptionDtos = await Promise.all(
      subscriptions.map((subscription) =>
        this.transformToResponseDto(subscription),
      ),
    );

    return {
      subscriptions: subscriptionDtos,
      total,
    };
  }

  async findOne(
    id: string,
    currentUserId?: string,
  ): Promise<SubscriptionResponseDto> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!subscription) {
      throw new NotFoundException('Подписка не найдена');
    }

    // Проверяем права доступа
    if (currentUserId && subscription.userId !== currentUserId) {
      throw new ForbiddenException('Нет прав доступа к данной подписке');
    }

    return await this.transformToResponseDto(subscription);
  }

  async updateStatus(
    id: string,
    updateSubscriptionStatusDto: UpdateSubscriptionStatusDto,
    currentUserId?: string,
  ): Promise<SubscriptionResponseDto> {
    return await this.dataSource.transaction(async (manager) => {
      const subscription = await manager.findOne(Subscription, {
        where: { id },
        relations: ['user'],
      });

      if (!subscription) {
        throw new NotFoundException('Подписка не найдена');
      }

      // Проверяем права доступа (кроме админов)
      if (currentUserId && subscription.userId !== currentUserId) {
        throw new ForbiddenException('Нет прав доступа к данной подписке');
      }

      const oldStatus = subscription.status;
      subscription.status =
        updateSubscriptionStatusDto.status as SubscriptionStatus;

      if (
        updateSubscriptionStatusDto.status === 'canceled' &&
        updateSubscriptionStatusDto.canceledAt
      ) {
        subscription.canceledAt = new Date(
          updateSubscriptionStatusDto.canceledAt,
        );
      } else if (
        updateSubscriptionStatusDto.status === SubscriptionStatus.CANCELED
      ) {
        subscription.canceledAt = new Date();
      }

      const updatedSubscription = await manager.save(subscription);

      // Логируем изменение статуса
      const auditAction =
        updateSubscriptionStatusDto.status === SubscriptionStatus.CANCELED
          ? PaymentAuditAction.SUBSCRIPTION_CANCELLED
          : PaymentAuditAction.SUBSCRIPTION_ACTIVATED;

      await this.auditService.logPaymentAction(
        auditAction,
        subscription.userId,
        {
          subscriptionId: id,
          metadata: {
            oldStatus,
            newStatus: updateSubscriptionStatusDto.status,
            updatedBy: currentUserId,
          },
        },
      );

      return this.transformToResponseDto(updatedSubscription);
    });
  }

  async getUserActiveSubscription(
    userId: string,
    currentUserId?: string,
  ): Promise<SubscriptionResponseDto | null> {
    // Проверяем права доступа
    if (currentUserId && userId !== currentUserId) {
      throw new ForbiddenException(
        'Нет прав доступа к подпискам данного пользователя',
      );
    }

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

    return await this.transformToResponseDto(subscription);
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

  async remove(id: string, currentUserId?: string): Promise<void> {
    return await this.dataSource.transaction(async (manager) => {
      const subscription = await manager.findOne(Subscription, {
        where: { id },
      });

      if (!subscription) {
        throw new NotFoundException('Подписка не найдена');
      }

      // Проверяем права доступа (только админы могут удалять)
      if (currentUserId && subscription.userId !== currentUserId) {
        throw new ForbiddenException('Нет прав для удаления данной подписки');
      }

      await manager.remove(subscription);

      // Логируем удаление
      await this.auditService.logPaymentAction(
        PaymentAuditAction.SUBSCRIPTION_CANCELLED,
        subscription.userId,
        {
          subscriptionId: id,
          metadata: {
            action: 'deleted',
            deletedBy: currentUserId,
          },
        },
      );
    });
  }

  // Метод для получения активной подписки пользователя
  async getActiveSubscription(
    userId: string,
    currentUserId?: string,
  ): Promise<Subscription | null> {
    // Проверяем права доступа
    if (currentUserId && userId !== currentUserId) {
      throw new ForbiddenException(
        'Нет прав доступа к подпискам данного пользователя',
      );
    }

    return await this.subscriptionRepository.findOne({
      where: {
        userId,
        status: SubscriptionStatus.ACTIVE,
      },
    });
  }

  private async transformToResponseDto(
    subscription: Subscription,
    user?: User,
  ): Promise<SubscriptionResponseDto> {
    const userResponseDto: UserResponseDto = user
      ? {
          id: user.id,
          name: user.name,
          phone: user.phone,
        }
      : subscription.user
        ? {
            id: subscription.user.id,
            name: subscription.user.name,
            phone: subscription.user.phone,
          }
        : {
            id: '',
            name: '',
            phone: '',
          };

    // Ищем неоплаченный платеж для подписки
    let paymentUrl: string | undefined;
    if (subscription.status === SubscriptionStatus.PENDING) {
      const pendingPayment = await this.dataSource
        .getRepository(SubscriptionPayment)
        .findOne({
          where: {
            subscriptionId: subscription.id,
            status: SubscriptionPaymentStatus.PENDING,
          },
          order: { createdAt: 'DESC' },
        });

      if (pendingPayment) {
        paymentUrl = pendingPayment.paymentUrl;
      }
    }

    return {
      id: subscription.id,
      user: userResponseDto,
      type: subscription.type,
      status: subscription.status,
      price: subscription.price,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      canceledAt: subscription.canceledAt,
      ordersLimit: subscription.ordersLimit,
      usedOrders: subscription.usedOrders,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
      paymentUrl,
    };
  }
}
