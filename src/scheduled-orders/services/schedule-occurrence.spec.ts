import { ScheduleFrequency } from '../entities/scheduled-order.entity';
import { findDueOccurrence, OccurrenceSchedule } from './schedule-occurrence';

/**
 * Расписание считается по московскому времени. Проверяем именно то, на чём
 * старый расчёт ломался: сутки и дни недели брались в UTC, время выноса не
 * влияло на момент создания, а заказ ставился на сутки вперёд от создания.
 */
describe('findDueOccurrence', () => {
  /** Момент по московскому времени (МСК = UTC+3) */
  const msk = (iso: string) => new Date(`${iso}+03:00`);

  const schedule = (
    overrides: Partial<OccurrenceSchedule> = {},
  ): OccurrenceSchedule => ({
    frequency: ScheduleFrequency.DAILY,
    preferredTime: '10:00',
    startDate: msk('2026-10-01T00:00:00'),
    ...overrides,
  });

  it('заказывает вынос на сегодня, а не на завтра', () => {
    const due = findDueOccurrence(schedule(), msk('2026-10-20T00:30:00'));

    expect(due).toEqual(msk('2026-10-20T10:00:00'));
  });

  it('ставит вынос на выбранное время, а не на момент создания', () => {
    const due = findDueOccurrence(
      schedule({ preferredTime: '07:30' }),
      msk('2026-10-20T00:30:00'),
    );

    expect(due).toEqual(msk('2026-10-20T07:30:00'));
  });

  it('без выбранного времени ставит на 10:00 по Москве', () => {
    const due = findDueOccurrence(
      schedule({ preferredTime: undefined }),
      msk('2026-10-20T00:30:00'),
    );

    expect(due).toEqual(msk('2026-10-20T10:00:00'));
  });

  it('не создаёт заказ задним числом, если время уже прошло', () => {
    expect(findDueOccurrence(schedule(), msk('2026-10-20T10:00:01'))).toBeNull();
  });

  it('не повторяет вынос, за который заказ уже создан', () => {
    const due = findDueOccurrence(
      schedule({ lastCreatedAt: msk('2026-10-20T10:00:00') }),
      msk('2026-10-20T09:00:00'),
    );

    expect(due).toBeNull();
  });

  it('на следующий день создаёт снова', () => {
    const due = findDueOccurrence(
      schedule({ lastCreatedAt: msk('2026-10-20T10:00:00') }),
      msk('2026-10-21T00:30:00'),
    );

    expect(due).toEqual(msk('2026-10-21T10:00:00'));
  });

  it('пропущенные дни не наверстываются', () => {
    // крон стоял три дня — создаём только сегодняшний вынос
    const due = findDueOccurrence(
      schedule({ lastCreatedAt: msk('2026-10-17T10:00:00') }),
      msk('2026-10-20T00:30:00'),
    );

    expect(due).toEqual(msk('2026-10-20T10:00:00'));
  });

  describe('дни недели по московскому времени', () => {
    // 20 октября 2026 — вторник
    const tuesday = schedule({
      frequency: ScheduleFrequency.CUSTOM,
      daysOfWeek: [2],
    });

    it('ночь вторника по Москве — это ещё понедельник по UTC', () => {
      const now = msk('2026-10-20T00:30:00');
      // 21:30 UTC понедельника: старый расчёт на getUTCDay() дал бы 1
      expect(now.getUTCDay()).toBe(1);

      expect(findDueOccurrence(tuesday, now)).toEqual(
        msk('2026-10-20T10:00:00'),
      );
    });

    it('в неподходящий день ничего не создаёт', () => {
      expect(findDueOccurrence(tuesday, msk('2026-10-21T00:30:00'))).toBeNull();
    });
  });

  describe('частоты', () => {
    it('через день считает от даты начала', () => {
      const everyOther = schedule({
        frequency: ScheduleFrequency.EVERY_OTHER_DAY,
        startDate: msk('2026-10-20T00:00:00'),
      });

      expect(findDueOccurrence(everyOther, msk('2026-10-22T00:30:00'))).toEqual(
        msk('2026-10-22T10:00:00'),
      );
      expect(
        findDueOccurrence(everyOther, msk('2026-10-21T00:30:00')),
      ).toBeNull();
    });

    it('раз в неделю — в тот же день недели, что и начало', () => {
      const weekly = schedule({
        frequency: ScheduleFrequency.WEEKLY,
        startDate: msk('2026-10-20T00:00:00'),
      });

      expect(findDueOccurrence(weekly, msk('2026-10-27T00:30:00'))).toEqual(
        msk('2026-10-27T10:00:00'),
      );
      expect(findDueOccurrence(weekly, msk('2026-10-24T00:30:00'))).toBeNull();
    });
  });

  describe('границы расписания', () => {
    it('до даты начала не создаёт', () => {
      const future = schedule({ startDate: msk('2026-11-01T00:00:00') });

      expect(findDueOccurrence(future, msk('2026-10-20T00:30:00'))).toBeNull();
    });

    it('после даты окончания не создаёт', () => {
      const ended = schedule({ endDate: msk('2026-10-19T23:59:59') });

      expect(findDueOccurrence(ended, msk('2026-10-20T00:30:00'))).toBeNull();
    });

    it('в последний день расписания создаёт', () => {
      const ending = schedule({ endDate: msk('2026-10-20T23:59:59') });

      expect(findDueOccurrence(ending, msk('2026-10-20T00:30:00'))).toEqual(
        msk('2026-10-20T10:00:00'),
      );
    });
  });
});
