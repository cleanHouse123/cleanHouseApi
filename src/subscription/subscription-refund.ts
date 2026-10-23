/**
 * Возврат при отказе от подписки, пункт 6.7 Оферты:
 *
 *   Возврат = Стоимость подписки − Использованные выносы × Цена одного выноса
 *   Цена одного выноса = Стоимость подписки ÷ Количество выносов по тарифу
 *
 * Все суммы в копейках, как и везде в проекте.
 *
 * Оферта описывает только тарифы с фиксированным числом выносов. Для
 * безлимитного делить не на что, поэтому считаем пропорционально неиспользованным
 * дням — ближе всего к смыслу пункта, где возвращают за неполученное.
 *
 * Удержания из того же пункта — фактические расходы за поздние отмены (8.2) и
 * стоимость использованных пакетов (6.2) — здесь не считаются: ни тех, ни
 * других данных в базе нет. Администратор вычитает их вручную, выбрав
 * частичный возврат.
 */

const DAY = 24 * 60 * 60 * 1000;

export interface SubscriptionRefundInput {
  /** Стоимость подписки в копейках */
  price: number;
  /** Количество выносов по тарифу, -1 — безлимит */
  ordersLimit: number;
  usedOrders: number;
  startDate: Date | string;
  endDate: Date | string;
}

export interface SubscriptionRefundBreakdown {
  /** `per_pickup` — формула 6.7, `pro_rata` — безлимитный тариф по дням */
  method: 'per_pickup' | 'pro_rata';
  price: number;
  usedOrders: number;
  ordersLimit: number;
  /** Цена одного выноса в копейках, только для `per_pickup` */
  pricePerPickup?: number;
  /** Стоимость использованных выносов в копейках */
  usedAmount?: number;
  totalDays?: number;
  remainingDays?: number;
  /** Сколько предлагается вернуть, в копейках */
  refundAmount: number;
}

const clamp = (value: number, max: number): number =>
  Math.max(0, Math.min(Math.round(value), max));

const daysBetween = (from: Date, to: Date): number =>
  Math.ceil((to.getTime() - from.getTime()) / DAY);

export const calculateSubscriptionRefund = (
  subscription: SubscriptionRefundInput,
  now: Date,
): SubscriptionRefundBreakdown => {
  const price = Math.round(Number(subscription.price));
  const { ordersLimit, usedOrders } = subscription;

  if (ordersLimit > 0) {
    const pricePerPickup = Math.round(price / ordersLimit);
    const usedAmount = Math.round((price * usedOrders) / ordersLimit);

    return {
      method: 'per_pickup',
      price,
      usedOrders,
      ordersLimit,
      pricePerPickup,
      usedAmount,
      refundAmount: clamp(price - usedAmount, price),
    };
  }

  // Безлимит: возвращаем за неиспользованные дни
  const start = new Date(subscription.startDate);
  const end = new Date(subscription.endDate);
  const totalDays = Math.max(1, daysBetween(start, end));
  const remainingDays = Math.max(0, Math.min(totalDays, daysBetween(now, end)));

  return {
    method: 'pro_rata',
    price,
    usedOrders,
    ordersLimit,
    totalDays,
    remainingDays,
    refundAmount: clamp((price * remainingDays) / totalDays, price),
  };
};
