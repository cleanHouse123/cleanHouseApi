import {
  checkFreeze,
  applyFreeze,
  resumeEarly,
  MAX_FREEZE_DAYS,
  FREEZE_NOTICE_DAYS,
} from './subscription-freeze';

/**
 * Пункт 6.4: не более 14 дней за период, предупредить не позднее чем за
 * 2 дня до ближайшего выноса, период продлевается на срок паузы.
 */
describe('Заморозка подписки', () => {
  const now = new Date('2026-10-24T12:00:00.000Z');
  const DAY = 24 * 60 * 60 * 1000;

  const state = (overrides: Record<string, unknown> = {}) => ({
    freezeDaysUsed: 0,
    endDate: '2026-11-24T12:00:00.000Z',
    ...overrides,
  });

  const inDays = (days: number) => new Date(now.getTime() + days * DAY);

  describe('пределы', () => {
    it('пороги взяты из оферты', () => {
      expect(MAX_FREEZE_DAYS).toBe(14);
      expect(FREEZE_NOTICE_DAYS).toBe(2);
    });

    it('обычный срок проходит', () => {
      expect(checkFreeze(state(), 7, now)).toEqual({ ok: true });
    });

    it('ровно четырнадцать дней проходят', () => {
      expect(checkFreeze(state(), 14, now)).toEqual({ ok: true });
    });

    it('пятнадцать — уже нет', () => {
      expect(checkFreeze(state(), 15, now).ok).toBe(false);
    });

    it('остаток за период учитывается', () => {
      const result = checkFreeze(state({ freezeDaysUsed: 10 }), 5, now);

      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason).toContain('4');
    });

    it('исчерпанная заморозка отказывает', () => {
      const result = checkFreeze(state({ freezeDaysUsed: 14 }), 1, now);

      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason).toContain('исчерпана');
    });

    it('ноль и дробные дни не принимаются', () => {
      expect(checkFreeze(state(), 0, now).ok).toBe(false);
      expect(checkFreeze(state(), 1.5, now).ok).toBe(false);
      expect(checkFreeze(state(), -3, now).ok).toBe(false);
    });

    it('закончившийся период заморозить нельзя', () => {
      const result = checkFreeze(
        state({ endDate: '2026-10-01T00:00:00.000Z' }),
        3,
        now,
      );

      expect(result.ok).toBe(false);
    });
  });

  describe('предупреждение за два дня', () => {
    it('вынос через неделю — успеваем', () => {
      expect(checkFreeze(state(), 3, now, inDays(7)).ok).toBe(true);
    });

    it('ровно за два дня — ещё успеваем', () => {
      expect(checkFreeze(state(), 3, now, inDays(2)).ok).toBe(true);
    });

    it('вынос завтра — поздно', () => {
      const result = checkFreeze(state(), 3, now, inDays(1));

      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason).toContain('2 дня');
    });

    it('без запланированных выносов предупреждать не о чем', () => {
      expect(checkFreeze(state(), 3, now, null).ok).toBe(true);
    });
  });

  describe('продление периода', () => {
    it('конец периода сдвигается на срок заморозки', () => {
      const result = applyFreeze(state(), 7, now);

      expect(result.endDate).toEqual(new Date('2026-12-01T12:00:00.000Z'));
      expect(result.frozenUntil).toEqual(inDays(7));
      expect(result.freezeDaysUsed).toBe(7);
    });

    it('вторая заморозка копится к первой', () => {
      const result = applyFreeze(state({ freezeDaysUsed: 5 }), 4, now);

      expect(result.freezeDaysUsed).toBe(9);
    });
  });

  describe('досрочный выход из паузы', () => {
    const frozen = (days: number, overrides: Record<string, unknown> = {}) => ({
      ...state({ freezeDaysUsed: days }),
      endDate: new Date(
        new Date('2026-11-24T12:00:00.000Z').getTime() + days * DAY,
      ).toISOString(),
      frozenUntil: inDays(days).toISOString(),
      ...overrides,
    });

    it('недогулянные дни уходят из периода и возвращаются в остаток', () => {
      const result = resumeEarly(frozen(7), inDays(3));

      // три дня прошли, четыре остались
      expect(result.freezeDaysUsed).toBe(3);
      expect(result.endDate).toEqual(new Date('2026-11-27T12:00:00.000Z'));
    });

    it('выход в тот же день не отнимает ничего лишнего', () => {
      const result = resumeEarly(frozen(7), now);

      expect(result.freezeDaysUsed).toBe(0);
      expect(result.endDate).toEqual(new Date('2026-11-24T12:00:00.000Z'));
    });

    it('пауза, снятая через секунду, не стоит дня', () => {
      const result = resumeEarly(frozen(7), new Date(now.getTime() + 1000));

      expect(result.freezeDaysUsed).toBe(0);
    });

    it('начатый день остаётся за клиентом', () => {
      const result = resumeEarly(frozen(7), inDays(2.5));

      // полных дней осталось четыре, половинка не отбирается
      expect(result.freezeDaysUsed).toBe(3);
    });

    it('после конца паузы забирать нечего', () => {
      const result = resumeEarly(frozen(7), inDays(9));

      expect(result.freezeDaysUsed).toBe(7);
      expect(result.endDate).toEqual(new Date('2026-12-01T12:00:00.000Z'));
    });

    it('без даты паузы период не меняется', () => {
      const result = resumeEarly(frozen(7, { frozenUntil: null }), now);

      expect(result.freezeDaysUsed).toBe(7);
      expect(result.endDate).toEqual(new Date('2026-12-01T12:00:00.000Z'));
    });
  });
});
