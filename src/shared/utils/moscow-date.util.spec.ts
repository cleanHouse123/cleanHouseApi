import { formatMoscowDate, MOSCOW_OFFSET_MINUTES } from './moscow-date.util';

describe('formatMoscowDate', () => {
  it('сдвиг — три часа', () => {
    expect(MOSCOW_OFFSET_MINUTES).toBe(180);
  });

  it('день и месяц в родительном падеже', () => {
    expect(formatMoscowDate('2026-10-31T12:00:00.000Z')).toBe('31 октября');
  });

  it('поздний вечер по Москве — уже следующий день', () => {
    expect(formatMoscowDate('2026-10-31T21:30:00.000Z')).toBe('1 ноября');
  });

  it('все месяцы названы', () => {
    const names = Array.from({ length: 12 }, (_, month) =>
      formatMoscowDate(new Date(Date.UTC(2026, month, 15))),
    );

    expect(names).toEqual([
      '15 января',
      '15 февраля',
      '15 марта',
      '15 апреля',
      '15 мая',
      '15 июня',
      '15 июля',
      '15 августа',
      '15 сентября',
      '15 октября',
      '15 ноября',
      '15 декабря',
    ]);
  });

  it('объект Date понимает так же, как строку', () => {
    const date = new Date('2026-01-02T09:00:00.000Z');

    expect(formatMoscowDate(date)).toBe(formatMoscowDate(date.toISOString()));
  });
});
