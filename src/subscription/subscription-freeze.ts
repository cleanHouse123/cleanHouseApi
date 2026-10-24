/**
 * Заморозка подписки, пункт 6.4 Оферты:
 *
 *   «Заказчик вправе приостановить (заморозить) Подписку на срок не более
 *   14 календарных дней в течение одного Периода подписки, уведомив
 *   Исполнителя через ЛК не позднее чем за 2 календарных дня до начала
 *   ближайшего Слота. Период подписки продлевается на срок приостановления.»
 *
 * Клиент выбирает срок сразу, подписка оживает сама — забыть разморозить
 * нельзя, и 14 дней не утекут незаметно.
 */

/** Предел заморозки за один период подписки */
export const MAX_FREEZE_DAYS = 14;

/** За сколько дней до ближайшего выноса нужно предупредить */
export const FREEZE_NOTICE_DAYS = 2;

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

export interface FreezeState {
  /** Сколько дней заморозки уже израсходовано за период */
  freezeDaysUsed: number;
  endDate: Date | string;
}

export type FreezeRefusal =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Можно ли заморозить на столько дней.
 *
 * `nextPickupAt` — ближайший вынос: по нему считается срок предупреждения.
 * Если выносов не запланировано, предупреждать не о чем.
 */
export const checkFreeze = (
  subscription: FreezeState,
  days: number,
  now: Date,
  nextPickupAt?: Date | string | null,
): FreezeRefusal => {
  if (!Number.isInteger(days) || days < 1) {
    return { ok: false, reason: 'Срок заморозки — целое число дней от 1' };
  }

  const remaining = MAX_FREEZE_DAYS - subscription.freezeDaysUsed;

  if (remaining <= 0) {
    return {
      ok: false,
      reason: `Заморозка за период исчерпана: ${MAX_FREEZE_DAYS} дней уже использованы`,
    };
  }

  if (days > remaining) {
    return {
      ok: false,
      reason: `Осталось дней заморозки: ${remaining}`,
    };
  }

  const end = new Date(subscription.endDate);

  if (now >= end) {
    return { ok: false, reason: 'Период подписки уже закончился' };
  }

  if (nextPickupAt) {
    const noticeDeadline =
      new Date(nextPickupAt).getTime() - FREEZE_NOTICE_DAYS * DAY;

    if (now.getTime() > noticeDeadline) {
      return {
        ok: false,
        reason: `Заморозку нужно оформить не позднее чем за ${FREEZE_NOTICE_DAYS} дня до ближайшего выноса`,
      };
    }
  }

  return { ok: true };
};

export interface FrozenPeriod {
  frozenUntil: Date;
  /** Конец периода, продлённый на срок заморозки */
  endDate: Date;
  freezeDaysUsed: number;
}

/** Новые границы подписки после заморозки */
export const applyFreeze = (
  subscription: FreezeState,
  days: number,
  now: Date,
): FrozenPeriod => ({
  frozenUntil: new Date(now.getTime() + days * DAY),
  endDate: new Date(new Date(subscription.endDate).getTime() + days * DAY),
  freezeDaysUsed: subscription.freezeDaysUsed + days,
});

export interface ResumedPeriod {
  /** Конец периода без неиспользованных дней паузы */
  endDate: Date;
  freezeDaysUsed: number;
}

/**
 * Границы подписки, если пауза снята досрочно.
 *
 * Период продлевали на весь выбранный срок, поэтому недогулянные дни нужно
 * забрать назад — и вернуть их в остаток из 14 дней за период. Неполные дни
 * считаем в пользу клиента: день, начатый на паузе, остаётся за ним.
 */
export const resumeEarly = (
  subscription: FreezeState & { frozenUntil?: Date | string | null },
  now: Date,
): ResumedPeriod => {
  const left = subscription.frozenUntil
    ? new Date(subscription.frozenUntil).getTime() - now.getTime()
    : 0;
  // запас на доли секунды между записью паузы и выходом из неё: иначе
  // пауза, снятая тут же, стоила бы клиенту целого дня
  const unusedDays = Math.max(0, Math.floor((left + MINUTE) / DAY));

  return {
    endDate: new Date(
      new Date(subscription.endDate).getTime() - unusedDays * DAY,
    ),
    freezeDaysUsed: Math.max(0, subscription.freezeDaysUsed - unusedDays),
  };
};
