import { SubscriptionLimitsService } from './subscription-limits.service';
import { SubscriptionStatus } from '../entities/subscription.entity';

/**
 * Вынос возвращается в ту подписку, из которой был списан. Иначе, отменив
 * старый заказ, клиент получал бесплатный вынос по новой подписке.
 */
describe('SubscriptionLimitsService: счётчик выносов', () => {
  const build = (subscriptions: Record<string, unknown>[]) => {
    const updates: Record<string, unknown>[] = [];

    const subscriptionRepository = {
      findOne: jest.fn(({ where }: { where: any }) => {
        const conditions = Array.isArray(where) ? where : [where];
        const found = subscriptions.find((subscription) =>
          conditions.some((condition) =>
            Object.entries(condition).every(
              ([field, value]) => subscription[field] === value,
            ),
          ),
        );

        return Promise.resolve(found ?? null);
      }),
      update: jest.fn((id: string, patch: Record<string, unknown>) => {
        updates.push({ id, ...patch });

        return Promise.resolve({ affected: 1 });
      }),
    };

    const service = new SubscriptionLimitsService(
      subscriptionRepository as never,
      { findOne: jest.fn() } as never,
    );

    return { service, updates, subscriptionRepository };
  };

  const active = (overrides: Record<string, unknown> = {}) => ({
    id: 'new-sub',
    userId: 'user-1',
    status: SubscriptionStatus.ACTIVE,
    ordersLimit: 8,
    usedOrders: 0,
    ...overrides,
  });

  describe('списание', () => {
    it('возвращает подписку, из которой списан вынос', async () => {
      const { service, updates } = build([active({ usedOrders: 2 })]);

      await expect(service.incrementUsedOrders('user-1', 2)).resolves.toBe(
        'new-sub',
      );
      expect(updates).toEqual([{ id: 'new-sub', usedOrders: 3 }]);
    });

    it('без подписки списывать нечего', async () => {
      const { service, updates } = build([]);

      await expect(service.incrementUsedOrders('user-1', 2)).resolves.toBeNull();
      expect(updates).toEqual([]);
    });
  });

  describe('возврат выноса', () => {
    it('идёт в подписку, из которой вынос был списан', async () => {
      const { service, updates } = build([
        active(),
        { ...active({ id: 'old-sub', usedOrders: 5 }), status: SubscriptionStatus.CANCELED },
      ]);

      await service.decrementUsedOrders('user-1', 2, 'old-sub');

      expect(updates).toEqual([{ id: 'old-sub', usedOrders: 4 }]);
    });

    it('не трогает подписку, активную на момент отмены', async () => {
      const { service, updates } = build([
        active({ usedOrders: 1 }),
        { ...active({ id: 'old-sub', usedOrders: 5 }), status: SubscriptionStatus.EXPIRED },
      ]);

      await service.decrementUsedOrders('user-1', 2, 'old-sub');

      expect(updates.map((update) => update.id)).not.toContain('new-sub');
    });

    it('у старых платежей ссылки нет — берём текущую подписку', async () => {
      const { service, updates } = build([active({ usedOrders: 3 })]);

      await service.decrementUsedOrders('user-1', 2);

      expect(updates).toEqual([{ id: 'new-sub', usedOrders: 2 }]);
    });

    it('пауза не мешает вернуть вынос', async () => {
      const { service, updates } = build([
        { ...active({ usedOrders: 3 }), status: SubscriptionStatus.FROZEN },
      ]);

      await service.decrementUsedOrders('user-1', 2);

      expect(updates).toEqual([{ id: 'new-sub', usedOrders: 2 }]);
    });

    it('ниже нуля счётчик не уходит', async () => {
      const { service, updates } = build([active({ usedOrders: 1 })]);

      await service.decrementUsedOrders('user-1', 4, 'new-sub');

      expect(updates).toEqual([{ id: 'new-sub', usedOrders: 0 }]);
    });

    it('у безлимитной подписки считать нечего', async () => {
      const { service, updates } = build([
        active({ ordersLimit: -1, usedOrders: 3 }),
      ]);

      await service.decrementUsedOrders('user-1', 2, 'new-sub');

      expect(updates).toEqual([]);
    });

    it('исчезнувшая подписка не ломает отмену', async () => {
      const { service, updates } = build([active()]);

      await expect(
        service.decrementUsedOrders('user-1', 2, 'deleted-sub'),
      ).resolves.toBeUndefined();
      expect(updates).toEqual([]);
    });
  });
});
