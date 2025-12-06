import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, DataSource, In } from 'typeorm';
import {
  Subscription,
  SubscriptionStatus,
} from './entities/subscription.entity';
import { CreateSubscriptionDto } from './dto/subscription.dto';
import { UpdateSubscriptionStatusDto } from './dto/subscription.dto';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
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
import { FreeSubscriptionService } from './services/free-subscription.service';
import { SubscriptionPriceDto } from './dto/subscription-price.dto';
import { PriceValidationService } from './services/price-validation.service';
import { SubscriptionPlanWithPriceDto } from './dto/subscription-plan-with-price.dto';
import { SubscriptionPlanResponseDto } from './dto/subscription-plan-response.dto';
import { SubscriptionPlansService } from './services/subscription-plans.service';

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(SubscriptionPlan)
    private subscriptionPlanRepository: Repository<SubscriptionPlan>,
    private auditService: AuditService,
    private dataSource: DataSource,
    private freeSubscriptionService: FreeSubscriptionService,
    private priceValidationService: PriceValidationService,
    private subscriptionPlansService: SubscriptionPlansService,
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

  async createByPlan(
    planId: string,
    userId: string,
  ): Promise<SubscriptionResponseDto> {
    return await this.dataSource.transaction(async (manager) => {
      // Получаем план подписки
      const plan = await manager.findOne(SubscriptionPlan, {
        where: { id: planId },
      });

      if (!plan) {
        throw new NotFoundException('План подписки не найден');
      }

      // Проверяем существование пользователя
      const user = await manager.findOne(User, {
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('Пользователь не найден');
      }

      // Проверяем, нет ли у пользователя активной подписки
      const existingActiveSubscription = await manager.findOne(Subscription, {
        where: {
          userId: userId,
          status: SubscriptionStatus.ACTIVE,
        },
      });

      if (existingActiveSubscription) {
        throw new BadRequestException(
          'У пользователя уже есть активная подписка',
        );
      }

      // Вычисляем даты начала и окончания
      const startDate = new Date();
      const endDate = new Date();
      
      if (plan.type === 'monthly') {
        endDate.setMonth(endDate.getMonth() + 1);
      } else if (plan.type === 'yearly') {
        endDate.setFullYear(endDate.getFullYear() + 1);
      }

      // Проверяем право на бесплатную подписку
      const freeSubscriptionCheck =
        await this.freeSubscriptionService.checkEligibilityForFreeSubscription(
          userId,
        );

      // Вычисляем финальную цену на сервере
      let finalPrice = plan.priceInKopecks;
      let subscriptionStatus = SubscriptionStatus.PENDING;

      if (freeSubscriptionCheck.eligible) {
        finalPrice = 0;
        subscriptionStatus = SubscriptionStatus.ACTIVE; // Бесплатная подписка активируется сразу
        // Помечаем, что использована бесплатная подписка (в транзакции для атомарности)
        // Если пользователь уже использовал, выбросит ошибку и транзакция откатится
        try {
          await this.freeSubscriptionService.markFreeSubscriptionUsed(
            userId,
            manager,
          );
        } catch (error) {
          // Если уже использовал, выбрасываем понятную ошибку
          throw new BadRequestException(
            error.message || 'Не удалось активировать бесплатную подписку',
          );
        }
      }

      // Создаем новую подписку на основе плана
      const subscription = manager.create(Subscription, {
        userId: userId,
        type: plan.type as any, // Приводим к SubscriptionType
        price: finalPrice,
        startDate: startDate,
        endDate: endDate,
        status: subscriptionStatus,
        ordersLimit: plan.ordersLimit,
        usedOrders: 0,
      });

      const savedSubscription = await manager.save(subscription);

      // Логируем создание подписки
      await this.auditService.logPaymentAction(
        PaymentAuditAction.SUBSCRIPTION_ACTIVATED,
        userId,
        {
          subscriptionId: savedSubscription.id,
          amount: savedSubscription.price,
          metadata: {
            type: savedSubscription.type,
            startDate: savedSubscription.startDate,
            endDate: savedSubscription.endDate,
            planId: planId,
            isFreeReferralSubscription: freeSubscriptionCheck.eligible,
            referralCount: freeSubscriptionCheck.referralCount,
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
      const newStatus =
        updateSubscriptionStatusDto.status as SubscriptionStatus;

      // Валидация при активации подписки
      if (newStatus === SubscriptionStatus.ACTIVE) {
        // Проверяем, что подписка не отменена
        if (oldStatus === SubscriptionStatus.CANCELED) {
          throw new BadRequestException(
            'Невозможно активировать отмененную подписку',
          );
        }

        // Проверяем, что подписка не истекла
        if (oldStatus === SubscriptionStatus.EXPIRED) {
          throw new BadRequestException(
            'Невозможно активировать истекшую подписку',
          );
        }

        // Проверяем дату окончания подписки
        const now = new Date();
        if (subscription.endDate < now) {
          throw new BadRequestException(
            'Невозможно активировать подписку: дата окончания уже прошла',
          );
        }
      }

      subscription.status = newStatus;

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

    // Обновляем все истекшие подписки, а не только первую
    if (expiredIds.length > 0) {
      await this.subscriptionRepository.update(
        { id: In(expiredIds) },
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
          id: user?.id || '',
          name: user?.name || '',
          phone: user?.phone || '',
        }
      : subscription?.user
        ? {
            id: subscription.user?.id || '',
            name: subscription.user?.name || '',
            phone: subscription.user?.phone || '',
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
      id: subscription?.id || '',
      user: userResponseDto,
      type: subscription?.type || null,
      status: subscription?.status || null,
      price: subscription?.price || 0,
      startDate: subscription?.startDate || new Date(),
      endDate: subscription?.endDate || new Date(),
      canceledAt: subscription?.canceledAt || undefined,
      ordersLimit: subscription?.ordersLimit || 0,
      usedOrders: subscription?.usedOrders || 0,
      createdAt: subscription?.createdAt || new Date(),
      updatedAt: subscription?.updatedAt || new Date(),
      paymentUrl,
    };
  }

  /**
   * Получает предварительную финальную цену подписки с учетом прав на бесплатную подписку
   */
  async getSubscriptionPrice(
    planId: string,
    userId: string,
  ): Promise<SubscriptionPriceDto> {
    // Получаем план подписки
    const plan = await this.priceValidationService.getSubscriptionPlanById(
      planId,
    );

    // Получаем пользователя для проверки, использовал ли он уже бесплатную подписку
    const user = await this.userRepository.findOne({ where: { id: userId } });

    // Проверяем право на бесплатную подписку
    const freeSubscriptionCheck =
      await this.freeSubscriptionService.checkEligibilityForFreeSubscription(
        userId,
      );

    // Вычисляем финальную цену
    const finalPrice = freeSubscriptionCheck.eligible
      ? 0
      : plan.priceInKopecks;

    return {
      basePrice: plan.priceInKopecks,
      finalPrice,
      isEligibleForFree: freeSubscriptionCheck.eligible,
      referralCount: freeSubscriptionCheck.referralCount,
      reason: freeSubscriptionCheck.reason,
      hasUsedFreeSubscription: user?.hasUsedFreeReferralSubscription || false,
    };
  }

  /**
   * Получает все планы подписок с финальными ценами для конкретного пользователя
   */
  async getAllPlansWithPrices(
    userId: string,
  ): Promise<SubscriptionPlanWithPriceDto[]> {
    // Получаем все планы
    const plans = await this.subscriptionPlansService.findAll();

    // Получаем пользователя для проверки, использовал ли он уже бесплатную подписку
    const user = await this.userRepository.findOne({ where: { id: userId } });

    // Проверяем право на бесплатную подписку один раз
    const freeSubscriptionCheck =
      await this.freeSubscriptionService.checkEligibilityForFreeSubscription(
        userId,
      );

    // Для каждого плана рассчитываем финальную цену
    const plansWithPrices = await Promise.all(
      plans.map(async (plan) => {
        // Вычисляем финальную цену (одинаковая для всех планов, если есть право)
        const finalPrice = freeSubscriptionCheck.eligible
          ? 0
          : plan.priceInKopecks;

        return {
          ...plan,
          finalPriceInKopecks: finalPrice,
          finalPriceInRubles: finalPrice / 100,
          isEligibleForFree: freeSubscriptionCheck.eligible,
          referralCount: freeSubscriptionCheck.referralCount,
          hasUsedFreeSubscription:
            user?.hasUsedFreeReferralSubscription || false,
        } as SubscriptionPlanWithPriceDto;
      }),
    );

    return plansWithPrices;
  }
}
