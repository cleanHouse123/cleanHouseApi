import { calculateSubscriptionRefund } from './subscription-refund';

/**
 * Формула пункта 6.7: возвращается стоимость неиспользованных выносов.
 * Суммы в копейках.
 */
describe('calculateSubscriptionRefund', () => {
  const now = new Date('2026-10-24T12:00:00.000Z');

  const subscription = (overrides: Record<string, unknown> = {}) => ({
    price: 100_000, // 1000 ₽
    ordersLimit: 10,
    usedOrders: 0,
    startDate: '2026-10-01T00:00:00.000Z',
    endDate: '2026-10-31T00:00:00.000Z',
    ...overrides,
  });

  it('ничего не использовано — возвращается вся стоимость', () => {
    const result = calculateSubscriptionRefund(subscription(), now);

    expect(result.method).toBe('per_pickup');
    expect(result.pricePerPickup).toBe(10_000);
    expect(result.refundAmount).toBe(100_000);
  });

  it('три выноса из десяти — возврат за семь', () => {
    const result = calculateSubscriptionRefund(
      subscription({ usedOrders: 3 }),
      now,
    );

    expect(result.usedAmount).toBe(30_000);
    expect(result.refundAmount).toBe(70_000);
  });

  it('использовано всё — возвращать нечего', () => {
    const result = calculateSubscriptionRefund(
      subscription({ usedOrders: 10 }),
      now,
    );

    expect(result.refundAmount).toBe(0);
  });

  it('использовано больше лимита — ноль, а не минус', () => {
    const result = calculateSubscriptionRefund(
      subscription({ usedOrders: 12 }),
      now,
    );

    expect(result.refundAmount).toBe(0);
  });

  it('цена, не делящаяся нацело, не теряет копейки', () => {
    // 1 ₽ на 8 выносов: цена выноса 12,5 коп.
    const result = calculateSubscriptionRefund(
      subscription({ price: 100, ordersLimit: 8, usedOrders: 1 }),
      now,
    );

    // считаем от общей суммы, а не от округлённой цены выноса
    expect(result.usedAmount).toBe(13);
    expect(result.refundAmount).toBe(87);
  });

  it('сумма возврата никогда не больше оплаченной', () => {
    const result = calculateSubscriptionRefund(
      subscription({ usedOrders: -5 }),
      now,
    );

    expect(result.refundAmount).toBe(100_000);
  });

  describe('безлимитный тариф', () => {
    const unlimited = (overrides: Record<string, unknown> = {}) =>
      subscription({ ordersLimit: -1, ...overrides });

    it('считается по неиспользованным дням', () => {
      // с 1 по 31 октября — 30 дней, на 24-е осталось 7
      const result = calculateSubscriptionRefund(unlimited(), now);

      expect(result.method).toBe('pro_rata');
      expect(result.totalDays).toBe(30);
      expect(result.remainingDays).toBe(7);
      expect(result.refundAmount).toBe(Math.round((100_000 * 7) / 30));
    });

    it('после окончания периода не возвращается ничего', () => {
      const result = calculateSubscriptionRefund(
        unlimited(),
        new Date('2026-11-05T00:00:00.000Z'),
      );

      expect(result.remainingDays).toBe(0);
      expect(result.refundAmount).toBe(0);
    });

    it('отмена в первый же день возвращает всё', () => {
      const result = calculateSubscriptionRefund(
        unlimited(),
        new Date('2026-10-01T00:00:00.000Z'),
      );

      expect(result.refundAmount).toBe(100_000);
    });
  });
});
