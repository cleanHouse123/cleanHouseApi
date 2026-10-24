import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import {
  Subscription,
  SubscriptionStatus,
} from '../entities/subscription.entity';
import {
  SubscriptionPayment,
  SubscriptionPaymentStatus,
} from '../entities/subscription-payment.entity';
import { RefundStatus } from '../../order/entities/payment.entity';
import { ScheduledOrder } from '../../scheduled-orders/entities/scheduled-order.entity';
import { RefundService } from '../../order/services/refund.service';
import { RefundDecision } from '../../order/dto/cancel-with-refund.dto';
import { CancelSubscriptionDto } from '../dto/cancel-subscription.dto';
import {
  calculateSubscriptionRefund,
  SubscriptionRefundBreakdown,
} from '../subscription-refund';

export interface SubscriptionAwaitingRefund {
  subscriptionId: string;
  paymentId: string;
  amount: number;
  customerName?: string;
  canceledAt: Date;
  suggested: SubscriptionRefundBreakdown;
}

/**
 * Отказ от подписки и возврат по пункту 6.7 Оферты.
 *
 * Отмена не удаляет подписку: строка и история платежей остаются, иначе
 * считать возврат не из чего и нечем доказать, что он был должен.
 */
@Injectable()
export class SubscriptionRefundService {
  private readonly logger = new Logger(SubscriptionRefundService.name);

  constructor(
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    @InjectRepository(SubscriptionPayment)
    private paymentRepository: Repository<SubscriptionPayment>,
    @InjectRepository(ScheduledOrder)
    private scheduledOrderRepository: Repository<ScheduledOrder>,
    private refundService: RefundService,
  ) {}

  /** Сколько вернули бы прямо сейчас — для диалога в админке */
  async previewRefund(
    subscriptionId: string,
  ): Promise<SubscriptionRefundBreakdown> {
    const subscription = await this.findSubscription(subscriptionId);

    return calculateSubscriptionRefund(subscription, new Date());
  }

  /**
   * Отказ клиента от подписки. Деньги здесь не трогаем: решение принимает
   * администратор, а подписка попадает в очередь «ожидают возврата».
   */
  async cancelByCustomer(
    subscriptionId: string,
    customerId: string,
  ): Promise<Subscription> {
    const subscription = await this.findSubscription(subscriptionId);

    if (subscription.userId !== customerId) {
      throw new ForbiddenException('Это подписка другого пользователя');
    }

    if (subscription.status === SubscriptionStatus.CANCELED) {
      throw new BadRequestException('Подписка уже отменена');
    }

    return this.finishCancellation(subscription);
  }

  /**
   * Отмена подписки вместе с решением по деньгам.
   *
   * Возврат уходит до смены статуса: если YooKassa его отклонит, подписка
   * останется активной и администратор повторит попытку — ключ
   * идемпотентности не даст вернуть деньги дважды.
   */
  async cancelWithRefund(
    subscriptionId: string,
    dto: CancelSubscriptionDto,
    decidedBy: string,
  ): Promise<Subscription> {
    const subscription = await this.findSubscription(subscriptionId);
    const payment = await this.findPaidPayment(subscriptionId);

    // Отменённая подписка ещё может ждать решения по деньгам: так она
    // попадает в очередь, когда отказался клиент. Решают один раз
    if (subscription.status === SubscriptionStatus.CANCELED) {
      if (!payment || !payment.yookassaId) {
        throw new BadRequestException('Подписка уже отменена');
      }
      if (payment.refundStatus) {
        throw new BadRequestException('Решение по возврату уже принято');
      }
    }

    // Подписка не оплачивалась деньгами — решать нечего
    if (!payment || !payment.yookassaId) {
      return this.finishCancellation(subscription);
    }

    const paidKopecks = Math.round(Number(payment.amount));

    if (dto.refund === RefundDecision.NONE) {
      if (!dto.reason?.trim()) {
        throw new BadRequestException(
          'Укажите причину, по которой деньги не возвращаются',
        );
      }

      payment.refundStatus = RefundStatus.NONE;
      payment.refundReason = dto.reason.trim();
      payment.refundDecidedAt = new Date();
      payment.refundDecidedBy = decidedBy;
      await this.paymentRepository.save(payment);

      return this.finishCancellation(subscription);
    }

    const suggested = calculateSubscriptionRefund(subscription, new Date());
    const refundKopecks =
      dto.refund === RefundDecision.FULL
        ? suggested.refundAmount
        : Math.round((dto.amount ?? 0) * 100);

    if (dto.refund === RefundDecision.PARTIAL && !dto.amount) {
      throw new BadRequestException('Укажите сумму частичного возврата');
    }

    if (refundKopecks > paidKopecks) {
      throw new BadRequestException(
        'Сумма возврата больше оплаченной стоимости подписки',
      );
    }

    if (refundKopecks <= 0) {
      throw new BadRequestException(
        'По формуле возвращать нечего. Выберите «без возврата» с причиной',
      );
    }

    const refund = await this.refundService.createRefund({
      yookassaPaymentId: payment.yookassaId,
      amountInKopecks: refundKopecks,
      description: `Возврат по подписке ${subscriptionId}`,
    });

    payment.refundId = refund.id;
    payment.refundAmount = refundKopecks;
    payment.refundStatus = refund.status as unknown as RefundStatus;
    payment.refundReason = dto.reason?.trim();
    payment.refundDecidedAt = new Date();
    payment.refundDecidedBy = decidedBy;

    if (refund.status === 'succeeded' && refundKopecks === paidKopecks) {
      payment.status = SubscriptionPaymentStatus.REFUNDED;
    }

    await this.paymentRepository.save(payment);

    this.logger.log(
      `Возврат ${refundKopecks} коп. по подписке ${subscriptionId}`,
    );

    return this.finishCancellation(subscription);
  }

  /**
   * Отменённые оплаченные подписки, по которым решение о деньгах не принято.
   * Та же страховка, что и у заказов: оферта даёт на возврат 10 дней.
   */
  async findAwaitingRefund(): Promise<SubscriptionAwaitingRefund[]> {
    const payments = await this.paymentRepository.find({
      where: {
        status: SubscriptionPaymentStatus.SUCCESS,
        refundStatus: IsNull(),
        yookassaId: Not(IsNull()),
      },
      order: { createdAt: 'DESC' },
    });

    const awaiting: SubscriptionAwaitingRefund[] = [];

    for (const payment of payments) {
      const subscription = await this.subscriptionRepository.findOne({
        where: { id: payment.subscriptionId },
        relations: ['user'],
      });

      if (!subscription || subscription.status !== SubscriptionStatus.CANCELED) {
        continue;
      }

      awaiting.push({
        subscriptionId: subscription.id,
        paymentId: payment.id,
        amount: Math.round(Number(payment.amount)),
        customerName: subscription.user?.name,
        canceledAt: subscription.updatedAt,
        suggested: calculateSubscriptionRefund(subscription, new Date()),
      });
    }

    return awaiting;
  }

  private async finishCancellation(
    subscription: Subscription,
  ): Promise<Subscription> {
    if (subscription.status === SubscriptionStatus.CANCELED) {
      return subscription;
    }

    subscription.status = SubscriptionStatus.CANCELED;
    await this.deactivateSchedules(subscription.userId);

    return this.subscriptionRepository.save(subscription);
  }

  /**
   * Без подписки расписания всё равно не создают заказов — крон выключает
   * их при первом же проходе. Выключаем сразу, чтобы клиент не видел
   * активными те, что уже ничего не сделают.
   */
  private async deactivateSchedules(customerId: string): Promise<void> {
    const { affected } = await this.scheduledOrderRepository.update(
      { customerId, isActive: true },
      { isActive: false },
    );

    if (affected) {
      this.logger.log(
        `Отказ от подписки: выключено расписаний — ${affected}`,
      );
    }
  }

  private async findSubscription(id: string): Promise<Subscription> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id },
    });

    if (!subscription) {
      throw new NotFoundException('Подписка не найдена');
    }

    return subscription;
  }

  private async findPaidPayment(
    subscriptionId: string,
  ): Promise<SubscriptionPayment | null> {
    return this.paymentRepository.findOne({
      where: {
        subscriptionId,
        status: SubscriptionPaymentStatus.SUCCESS,
      },
      order: { createdAt: 'DESC' },
    });
  }
}
