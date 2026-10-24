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
 * Из возврата удерживается стоимость использованных пакетов — пункт 6.2
 * Оферты, по одному пакету на состоявшийся вынос. Цена пакета берётся из
 * тарифа на момент покупки; ноль означает «не удерживать».
 *
 * Фактические расходы за поздние отмены (8.2) по-прежнему не считаются:
 * этих данных в базе нет, администратор вычитает их вручную.
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
  /** Цена одного пакета в копейках, 0 — не удерживать */
  bagPriceInKopecks?: number;
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
  /** Удержано за использованные пакеты, пункт 6.2 Оферты */
  bagsDeduction: number;
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

  // по одному пакету на состоявшийся вынос
  const bagsDeduction = Math.max(
    0,
    Math.round((subscription.bagPriceInKopecks ?? 0) * Math.max(0, usedOrders)),
  );

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
      bagsDeduction,
      refundAmount: clamp(price - usedAmount - bagsDeduction, price),
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
    bagsDeduction,
    refundAmount: clamp(
      (price * remainingDays) / totalDays - bagsDeduction,
      price,
    ),
  };
};
