import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SubscriptionRefundService } from './subscription-refund.service';
import { SubscriptionStatus } from '../entities/subscription.entity';
import { SubscriptionPaymentStatus } from '../entities/subscription-payment.entity';
import { RefundStatus } from '../../order/entities/payment.entity';
import { RefundDecision } from '../../order/dto/cancel-with-refund.dto';

/**
 * Отказ от подписки: деньги возвращаются по формуле пункта 6.7, а сама
 * подписка не удаляется — иначе считать возврат не из чего.
 */
describe('SubscriptionRefundService', () => {
  const build = (
    subscriptionOverrides: Record<string, unknown> = {},
    paymentOverrides: Record<string, unknown> | null = {},
  ) => {
    const subscription: Record<string, unknown> = {
      id: 'sub-1',
      userId: 'user-1',
      status: SubscriptionStatus.ACTIVE,
      price: 100_000, // 1000 ₽
      ordersLimit: 10,
      usedOrders: 3,
      startDate: '2026-10-01T00:00:00.000Z',
      endDate: '2026-10-31T00:00:00.000Z',
      ...subscriptionOverrides,
    };

    const payment: Record<string, unknown> | null =
      paymentOverrides === null
        ? null
        : {
            id: 'pay-1',
            subscriptionId: 'sub-1',
            amount: 100_000,
            status: SubscriptionPaymentStatus.SUCCESS,
            yookassaId: 'yk-1',
            refundStatus: null,
            ...paymentOverrides,
          };

    const subscriptionRepository = {
      findOne: jest.fn().mockResolvedValue(subscription),
      save: jest.fn(async (value: unknown) => value),
    };
    const paymentRepository = {
      findOne: jest.fn().mockResolvedValue(payment),
      find: jest.fn().mockResolvedValue(payment ? [payment] : []),
      save: jest.fn(async (value: unknown) => value),
    };
    const refundService = {
      createRefund: jest.fn().mockResolvedValue({
        id: 'rf-1',
        status: 'succeeded',
        amountInKopecks: 70_000,
      }),
    };

    const service = Object.create(
      SubscriptionRefundService.prototype,
    ) as SubscriptionRefundService;
    Object.assign(service, {
      subscriptionRepository,
      paymentRepository,
      refundService,
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    return { service, subscription, payment, refundService, paymentRepository };
  };

  describe('отказ клиента', () => {
    it('переводит подписку в отменённые, не удаляя', async () => {
      const { service, subscription } = build();

      const result = await service.cancelByCustomer('sub-1', 'user-1');

      expect(result.status).toBe(SubscriptionStatus.CANCELED);
      expect(subscription.status).toBe(SubscriptionStatus.CANCELED);
    });

    it('чужую подписку отменить нельзя', async () => {
      const { service } = build();

      await expect(
        service.cancelByCustomer('sub-1', 'someone-else'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('повторный отказ отклоняется', async () => {
      const { service } = build({ status: SubscriptionStatus.CANCELED });

      await expect(
        service.cancelByCustomer('sub-1', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('решение по деньгам', () => {
    it('полный возврат считается по формуле, а не по всей сумме', async () => {
      const { service, refundService, payment } = build();

      await service.cancelWithRefund(
        'sub-1',
        { refund: RefundDecision.FULL },
        'admin-1',
      );

      // 3 выноса из 10 по 1000 ₽ — возвращаем 700 ₽
      expect(refundService.createRefund).toHaveBeenCalledWith(
        expect.objectContaining({ amountInKopecks: 70_000 }),
      );
      expect(payment!.refundAmount).toBe(70_000);
      // возврат неполный — платёж остаётся успешным
      expect(payment!.status).toBe(SubscriptionPaymentStatus.SUCCESS);
    });

    it('неиспользованная подписка возвращается целиком', async () => {
      const { service, refundService, payment } = build({ usedOrders: 0 });

      await service.cancelWithRefund(
        'sub-1',
        { refund: RefundDecision.FULL },
        'admin-1',
      );

      expect(refundService.createRefund).toHaveBeenCalledWith(
        expect.objectContaining({ amountInKopecks: 100_000 }),
      );
      expect(payment!.status).toBe(SubscriptionPaymentStatus.REFUNDED);
    });

    it('частичный возврат переводит рубли в копейки', async () => {
      const { service, refundService } = build();

      await service.cancelWithRefund(
        'sub-1',
        { refund: RefundDecision.PARTIAL, amount: 450.5 },
        'admin-1',
      );

      expect(refundService.createRefund).toHaveBeenCalledWith(
        expect.objectContaining({ amountInKopecks: 45_050 }),
      );
    });

    it('не даёт вернуть больше оплаченного', async () => {
      const { service, refundService } = build();

      await expect(
        service.cancelWithRefund(
          'sub-1',
          { refund: RefundDecision.PARTIAL, amount: 2000 },
          'admin-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(refundService.createRefund).not.toHaveBeenCalled();
    });

    it('если по формуле ноль — просит оформить отказ с причиной', async () => {
      const { service, refundService } = build({ usedOrders: 10 });

      await expect(
        service.cancelWithRefund(
          'sub-1',
          { refund: RefundDecision.FULL },
          'admin-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(refundService.createRefund).not.toHaveBeenCalled();
    });

    it('отказ в возврате требует причину', async () => {
      const { service } = build();

      await expect(
        service.cancelWithRefund(
          'sub-1',
          { refund: RefundDecision.NONE },
          'admin-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('отказ с причиной сохраняется без обращения в YooKassa', async () => {
      const { service, refundService, payment } = build();

      await service.cancelWithRefund(
        'sub-1',
        { refund: RefundDecision.NONE, reason: 'Выносы использованы' },
        'admin-1',
      );

      expect(refundService.createRefund).not.toHaveBeenCalled();
      expect(payment!.refundStatus).toBe(RefundStatus.NONE);
      expect(payment!.refundReason).toBe('Выносы использованы');
    });

    it('решение по уже отменённой подписке принимается один раз', async () => {
      const { service, refundService } = build(
        { status: SubscriptionStatus.CANCELED },
        { refundStatus: RefundStatus.SUCCEEDED },
      );

      await expect(
        service.cancelWithRefund(
          'sub-1',
          { refund: RefundDecision.FULL },
          'admin-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(refundService.createRefund).not.toHaveBeenCalled();
    });

    it('отменённая без решения — возврат ещё можно сделать', async () => {
      const { service, refundService } = build({
        status: SubscriptionStatus.CANCELED,
      });

      await service.cancelWithRefund(
        'sub-1',
        { refund: RefundDecision.FULL },
        'admin-1',
      );

      expect(refundService.createRefund).toHaveBeenCalled();
    });

    it('подписка без денег отменяется без возврата', async () => {
      const { service, refundService } = build({}, null);

      const result = await service.cancelWithRefund(
        'sub-1',
        { refund: RefundDecision.FULL },
        'admin-1',
      );

      expect(refundService.createRefund).not.toHaveBeenCalled();
      expect(result.status).toBe(SubscriptionStatus.CANCELED);
    });
  });
});
