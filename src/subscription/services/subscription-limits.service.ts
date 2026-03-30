import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Not } from 'typeorm';
import {
  Subscription,
  SubscriptionStatus,
} from '../entities/subscription.entity';
import { Order, OrderStatus } from '../../order/entities/order.entity';

export interface OrderLimitsCheck {
  canCreateOrder: boolean;
  remainingOrders: number;
  totalLimit: number;
  usedOrders: number;
  subscriptionType: string;
  subscriptionId: string;
  isExpired: boolean;
  expiryReason?: 'time' | 'limit';
}

@Injectable()
export class SubscriptionLimitsService {
  private readonly logger = new Logger(SubscriptionLimitsService.name);
  // Учёт лимита: потребление «заказов» от ceil(пакеты / 2); по подписке заказ — 2 пакета (60 л)
  private readonly PACKAGES_PER_ORDER = 2;

  private calculateConsumedOrders(numberPackages: number): number {
    // На всякий случай защищаемся от некорректных значений.
    const safeNumberPackages = Math.max(0, numberPackages || 0);
    return safeNumberPackages === 0
      ? 0
      : Math.ceil(safeNumberPackages / this.PACKAGES_PER_ORDER);
  }

  constructor(
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
  ) {}

  /**
   * Проверяет лимиты заказов для пользователя
   * @param userId ID пользователя
   * @param numberPackages Количество пакетов (по умолчанию 2)
   * @returns Информация о лимитах и возможности создания заказа
   */
  async checkOrderLimits(
    userId: string,
    numberPackages: number = 2,
  ): Promise<OrderLimitsCheck> {
    const activeSubscription = await this.subscriptionRepository.findOne({
      where: {
        userId,
        status: SubscriptionStatus.ACTIVE,
      },
    });

    if (!activeSubscription) {
      return this.getEmptyLimits();
    }

    // Проверяем, не истекла ли подписка по времени
    const now = new Date();
    if (now > activeSubscription.endDate) {
      await this.expireSubscription(activeSubscription.id, 'time');
      return this.getExpiredLimits('time');
    }

    // Если безлимит
    if (activeSubscription.ordersLimit === -1) {
      return this.getUnlimitedSubscription(activeSubscription);
    }

    // Проверяем лимиты заказов
    const remainingOrders = Math.max(
      0,
      activeSubscription.ordersLimit - activeSubscription.usedOrders,
    );
    const requiredOrders = this.calculateConsumedOrders(numberPackages);

    // Если лимиты исчерпаны или недостаточно для запрошенного количества пакетов
    if (remainingOrders === 0 || remainingOrders < requiredOrders) {
      if (remainingOrders === 0) {
        await this.expireSubscription(activeSubscription.id, 'limit');
        return this.getExpiredLimits('limit');
      }
      return {
        canCreateOrder: false,
        remainingOrders,
        totalLimit: activeSubscription.ordersLimit,
        usedOrders: activeSubscription.usedOrders,
        subscriptionType: activeSubscription.type,
        subscriptionId: activeSubscription.id,
        isExpired: false,
      };
    }

    return {
      canCreateOrder: true,
      remainingOrders,
      totalLimit: activeSubscription.ordersLimit,
      usedOrders: activeSubscription.usedOrders,
      subscriptionType: activeSubscription.type,
      subscriptionId: activeSubscription.id,
      isExpired: false,
    };
  }

  /**
   * Проверяет, может ли пользователь создать заказ
   * @param userId ID пользователя
   * @returns true если можно создать заказ, false если нет
   */
  async canCreateOrder(userId: string): Promise<boolean> {
    const limits = await this.checkOrderLimits(userId);
    return limits.canCreateOrder;
  }

  /**
   * Получает количество оставшихся заказов для пользователя
   * @param userId ID пользователя
   * @returns Количество оставшихся заказов (-1 для безлимита)
   */
  async getRemainingOrders(userId: string): Promise<number> {
    const limits = await this.checkOrderLimits(userId);
    return limits.remainingOrders;
  }

  /**
   * Получает статистику использования заказов
   * @param userId ID пользователя
   * @returns Объект со статистикой
   */
  async getOrderUsageStats(userId: string): Promise<{
    used: number;
    total: number;
    remaining: number;
    isUnlimited: boolean;
  }> {
    const limits = await this.checkOrderLimits(userId);

    return {
      used: limits.usedOrders,
      total: limits.totalLimit,
      remaining: limits.remainingOrders,
      isUnlimited: limits.totalLimit === -1,
    };
  }

  /**
   * Определяет период для подсчета заказов на основе дат подписки
   * @param startDate Дата начала подписки
   * @param endDate Дата окончания подписки
   * @returns Объект с начальной и конечной датой периода
   */
  private getLimitPeriod(
    startDate: Date,
    endDate: Date,
  ): { start: Date; end: Date } {
    const now = new Date();
    const subscriptionStart = new Date(startDate);
    const subscriptionEnd = new Date(endDate);

    // Если подписка еще не началась
    if (now < subscriptionStart) {
      return { start: subscriptionStart, end: subscriptionStart };
    }

    // Если подписка уже закончилась
    if (now > subscriptionEnd) {
      return { start: subscriptionEnd, end: subscriptionEnd };
    }

    // Подписка активна - считаем с начала подписки до текущего момента
    return { start: subscriptionStart, end: now };
  }

  /**
   * Проверяет лимиты для конкретного типа подписки
   * @param subscriptionType Тип подписки
   * @param userId ID пользователя
   * @returns Информация о лимитах
   */
  async checkLimitsForSubscriptionType(
    subscriptionType: string,
    userId: string,
  ): Promise<OrderLimitsCheck> {
    const limits = await this.checkOrderLimits(userId);

    // Если у пользователя нет подписки или тип не совпадает
    if (limits.subscriptionType !== subscriptionType) {
      return this.getEmptyLimits();
    }

    return limits;
  }

  /**
   * Увеличивает счетчик использованных заказов после создания заказа
   * @param userId ID пользователя
   * @param numberPackages Количество пакетов (по умолчанию 2)
   */
  async incrementUsedOrders(
    userId: string,
    numberPackages: number = 2,
  ): Promise<void> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { userId, status: SubscriptionStatus.ACTIVE },
    });

    if (subscription && subscription.ordersLimit !== -1) {
      const consumedOrders = this.calculateConsumedOrders(numberPackages);
      const newUsedOrders = subscription.usedOrders + consumedOrders;
      const reachedOrExceededLimit = newUsedOrders >= subscription.ordersLimit;

      await this.subscriptionRepository.update(subscription.id, {
        usedOrders: newUsedOrders,
        ...(reachedOrExceededLimit
          ? { status: SubscriptionStatus.EXPIRED }
          : {}),
      });

      this.logger.log(
        `Увеличен счетчик заказов для пользователя ${userId} на ${consumedOrders} (из ${numberPackages} пакетов): ${newUsedOrders}/${subscription.ordersLimit}`,
      );

      if (reachedOrExceededLimit) {
        this.logger.log(
          `Подписка ${subscription.id} автоматически завершена по причине: limit (достигнут лимит заказов)`,
        );
      }
    }
  }

  /**
   * Уменьшает счетчик использованных заказов при отмене заказа
   * @param userId ID пользователя
   */
  async decrementUsedOrders(
    userId: string,
    numberPackages: number = 2,
  ): Promise<void> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { userId, status: SubscriptionStatus.ACTIVE },
    });

    if (subscription && subscription.ordersLimit !== -1 && subscription.usedOrders > 0) {
      const consumedOrders = this.calculateConsumedOrders(numberPackages);
      const nextUsedOrders = Math.max(0, subscription.usedOrders - consumedOrders);
      await this.subscriptionRepository.update(subscription.id, {
        usedOrders: nextUsedOrders
      });
      
      this.logger.log(
        `Уменьшен счетчик заказов для пользователя ${userId}: ${nextUsedOrders}/${subscription.ordersLimit}`,
      );
    }
  }

  /**
   * Завершает подписку по указанной причине
   * @param subscriptionId ID подписки
   * @param reason Причина завершения ('time' или 'limit')
   */
  private async expireSubscription(
    subscriptionId: string,
    reason: 'time' | 'limit',
  ): Promise<void> {
    await this.subscriptionRepository.update(subscriptionId, {
      status: SubscriptionStatus.EXPIRED,
    });

    this.logger.log(
      `Подписка ${subscriptionId} завершена по причине: ${reason}`,
    );
  }

  /**
   * Возвращает пустые лимиты для пользователя без подписки
   */
  private getEmptyLimits(): OrderLimitsCheck {
    return {
      canCreateOrder: false,
      remainingOrders: 0,
      totalLimit: 0,
      usedOrders: 0,
      subscriptionType: 'none',
      subscriptionId: '',
      isExpired: false,
    };
  }

  /**
   * Возвращает лимиты для безлимитной подписки
   */
  private getUnlimitedSubscription(
    subscription: Subscription,
  ): OrderLimitsCheck {
    return {
      canCreateOrder: true,
      remainingOrders: -1, // безлимит
      totalLimit: -1,
      usedOrders: 0,
      subscriptionType: subscription.type,
      subscriptionId: subscription.id,
      isExpired: false,
    };
  }

  /**
   * Возвращает лимиты для завершенной подписки
   */
  private getExpiredLimits(reason: 'time' | 'limit'): OrderLimitsCheck {
    return {
      canCreateOrder: false,
      remainingOrders: 0,
      totalLimit: 0,
      usedOrders: 0,
      subscriptionType: 'expired',
      subscriptionId: '',
      isExpired: true,
      expiryReason: reason,
    };
  }
}
