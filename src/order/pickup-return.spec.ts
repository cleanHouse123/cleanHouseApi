import { shouldReturnPickup, PICKUP_RETURN_HOURS } from './pickup-return';

/**
 * Поздняя отмена заказа по подписке должна стоить выноса: иначе слот можно
 * занять и отменить перед самым приездом курьера без последствий.
 */
describe('shouldReturnPickup', () => {
  const pickup = new Date('2026-10-26T09:00:00.000Z');
  const hoursBefore = (hours: number) =>
    new Date(pickup.getTime() - hours * 60 * 60 * 1000);

  it('порог — три часа', () => {
    expect(PICKUP_RETURN_HOURS).toBe(3);
  });

  it('отмена сильно заранее возвращает вынос', () => {
    expect(shouldReturnPickup(pickup, hoursBefore(24))).toBe(true);
  });

  it('ровно за три часа ещё возвращает', () => {
    expect(shouldReturnPickup(pickup, hoursBefore(3))).toBe(true);
  });

  it('за две с половиной часа — уже нет', () => {
    expect(shouldReturnPickup(pickup, hoursBefore(2.5))).toBe(false);
  });

  it('за минуту до выноса — нет', () => {
    expect(shouldReturnPickup(pickup, new Date(pickup.getTime() - 60_000))).toBe(
      false,
    );
  });

  it('после времени выноса — нет', () => {
    expect(shouldReturnPickup(pickup, new Date(pickup.getTime() + 60_000))).toBe(
      false,
    );
  });

  it('без времени выноса опоздать невозможно', () => {
    expect(shouldReturnPickup(null, new Date())).toBe(true);
    expect(shouldReturnPickup(undefined, new Date())).toBe(true);
  });

  it('строку с датой понимает так же', () => {
    expect(shouldReturnPickup(pickup.toISOString(), hoursBefore(4))).toBe(true);
    expect(shouldReturnPickup(pickup.toISOString(), hoursBefore(1))).toBe(false);
  });
});
