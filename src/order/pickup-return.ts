/**
 * Сколько времени до выноса даётся на бесплатную отмену: отменил раньше —
 * вынос возвращается в подписку, позже — списывается. Порог согласован с
 * заказчиком; вынесен в переменную окружения на случай, если его поменяют.
 */
export const PICKUP_RETURN_HOURS = Number(
  process.env.SUBSCRIPTION_PICKUP_RETURN_HOURS ?? 3,
);

const HOUR = 60 * 60 * 1000;

/**
 * Возвращается ли вынос в подписку при отмене заказа.
 *
 * Раньше лимит возвращался всегда, хоть за минуту до выноса: можно было
 * занять слот, отменить его перед самым приездом курьера и ничего не
 * потерять. Теперь поздняя отмена стоит выноса.
 *
 * У заказа без времени выноса опоздать невозможно — лимит возвращается.
 */
export const shouldReturnPickup = (
  scheduledAt: Date | string | null | undefined,
  now: Date,
): boolean => {
  if (!scheduledAt) {
    return true;
  }

  const deadline =
    new Date(scheduledAt).getTime() - PICKUP_RETURN_HOURS * HOUR;

  return now.getTime() <= deadline;
};
