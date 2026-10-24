import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  Subscription,
  SubscriptionStatus,
} from '../entities/subscription.entity';
import { Order, OrderStatus } from '../../order/entities/order.entity';
import { applyFreeze, checkFreeze } from '../subscription-freeze';

/**
 * Приостановка подписки по пункту 6.4 Оферты.
 *
 * Клиент выбирает срок, подписка оживает сама: забыть разморозить нельзя,
 * и 14 дней за период не утекут незаметно.
 */
@Injectable()
export class SubscriptionFreezeService {
  private readonly logger = new Logger(SubscriptionFreezeService.name);

  constructor(
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
  ) {}

  async freeze(
    subscriptionId: string,
    days: number,
    customerId: string,
  ): Promise<Subscription> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new NotFoundException('Подписка не найдена');
    }

    if (subscription.userId !== customerId) {
      throw new ForbiddenException('Это подписка другого пользователя');
    }

    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      throw new BadRequestException(
        subscription.status === SubscriptionStatus.FROZEN
          ? 'Подписка уже приостановлена'
          : 'Приостановить можно только активную подписку',
      );
    }

    const now = new Date();
    const nextPickupAt = await this.findNextPickup(customerId, now);
    const verdict = checkFreeze(subscription, days, now, nextPickupAt);

    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }

    const frozen = applyFreeze(subscription, days, now);

    subscription.status = SubscriptionStatus.FROZEN;
    subscription.frozenUntil = frozen.frozenUntil;
    subscription.endDate = frozen.endDate;
    subscription.freezeDaysUsed = frozen.freezeDaysUsed;

    this.logger.log(
      `Подписка ${subscriptionId} приостановлена на ${days} дн. до ${frozen.frozenUntil.toISOString()}`,
    );

    return this.subscriptionRepository.save(subscription);
  }

  /**
   * Оживляет подписки, у которых срок паузы вышел.
   *
   * Раз в час: точность до часа здесь достаточна — заморозка меряется днями,
   * а заказы по подписке клиент оформляет сам.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async resumeExpiredFreezes(): Promise<void> {
    const due = await this.subscriptionRepository.find({
      where: {
        status: SubscriptionStatus.FROZEN,
        frozenUntil: LessThanOrEqual(new Date()),
      },
    });

    for (const subscription of due) {
      subscription.status = SubscriptionStatus.ACTIVE;
      subscription.frozenUntil = null;
      await this.subscriptionRepository.save(subscription);

      this.logger.log(`Подписка ${subscription.id} снова активна`);
    }
  }

  /**
   * Ближайший запланированный вынос клиента: от него считается срок
   * предупреждения из пункта 6.4.
   */
  private async findNextPickup(
    customerId: string,
    now: Date,
  ): Promise<Date | null> {
    const order = await this.orderRepository
      .createQueryBuilder('order')
      .where('order.customerId = :customerId', { customerId })
      .andWhere('order.scheduledAt > :now', { now })
      .andWhere('order.status NOT IN (:...finished)', {
        finished: [OrderStatus.DONE, OrderStatus.CANCELED],
      })
      .orderBy('order.scheduledAt', 'ASC')
      .getOne();

    return order?.scheduledAt ?? null;
  }
}
