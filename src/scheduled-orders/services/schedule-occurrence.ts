import { ScheduleFrequency } from '../entities/scheduled-order.entity';
import { MOSCOW_OFFSET_MINUTES } from '../../shared/utils/moscow-date.util';

/** Расписание живёт по московскому времени */
export { MOSCOW_OFFSET_MINUTES };

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** Время выноса, если клиент не выбрал своё */
const DEFAULT_TIME = '10:00';

export interface OccurrenceSchedule {
  frequency: ScheduleFrequency;
  preferredTime?: string;
  daysOfWeek?: number[];
  startDate: Date;
  endDate?: Date;
  lastCreatedAt?: Date;
}

interface MoscowDay {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
}

/** Календарные части момента по московскому времени */
const toMoscowDay = (date: Date): MoscowDay => {
  const shifted = new Date(date.getTime() + MOSCOW_OFFSET_MINUTES * MINUTE);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    dayOfWeek: shifted.getUTCDay(),
  };
};

/** Момент начала московских суток (00:00 МСК) в UTC */
const startOfMoscowDay = (day: MoscowDay): Date =>
  new Date(
    Date.UTC(day.year, day.month, day.day) - MOSCOW_OFFSET_MINUTES * MINUTE,
  );

/** Момент выноса в эти московские сутки */
const occurrenceAt = (day: MoscowDay, preferredTime?: string): Date => {
  const [hours, minutes] = (preferredTime ?? DEFAULT_TIME)
    .split(':')
    .map(Number);

  return new Date(
    Date.UTC(day.year, day.month, day.day, hours, minutes) -
      MOSCOW_OFFSET_MINUTES * MINUTE,
  );
};

/** Сколько целых московских суток прошло между двумя моментами */
const moscowDaysBetween = (from: Date, to: Date): number =>
  Math.round(
    (startOfMoscowDay(toMoscowDay(to)).getTime() -
      startOfMoscowDay(toMoscowDay(from)).getTime()) /
      DAY,
  );

/** Подходит ли день под частоту расписания */
const matchesFrequency = (
  schedule: OccurrenceSchedule,
  day: MoscowDay,
  dayStart: Date,
): boolean => {
  switch (schedule.frequency) {
    case ScheduleFrequency.DAILY:
      return true;

    case ScheduleFrequency.EVERY_OTHER_DAY:
      return moscowDaysBetween(schedule.startDate, dayStart) % 2 === 0;

    case ScheduleFrequency.WEEKLY:
      return moscowDaysBetween(schedule.startDate, dayStart) % 7 === 0;

    case ScheduleFrequency.CUSTOM:
      // приводим к числу и здесь: день недели из базы приходил строкой
      return (schedule.daysOfWeek ?? []).some(
        (value) => Number(value) === day.dayOfWeek,
      );

    default:
      return false;
  }
};

/**
 * Вынос, который нужно заказать прямо сейчас, или `null`.
 *
 * Заказ создаётся в тот же московский день, но до самого времени выноса:
 * курьер видит его заранее, а не задним числом. Поэтому подходит только
 * сегодняшний день — вчерашние выносы не восстанавливаются, даже если крон
 * стоял: заказ на прошедшее время никому не нужен.
 */
export const findDueOccurrence = (
  schedule: OccurrenceSchedule,
  now: Date,
): Date | null => {
  const today = toMoscowDay(now);
  const dayStart = startOfMoscowDay(today);

  if (!matchesFrequency(schedule, today, dayStart)) {
    return null;
  }

  const occurrence = occurrenceAt(today, schedule.preferredTime);

  // время выноса уже прошло — ждём следующего подходящего дня
  if (occurrence <= now) {
    return null;
  }

  if (occurrence < schedule.startDate) {
    return null;
  }

  if (schedule.endDate && occurrence > schedule.endDate) {
    return null;
  }

  // за этот вынос заказ уже создан
  if (schedule.lastCreatedAt && occurrence <= schedule.lastCreatedAt) {
    return null;
  }

  return occurrence;
};
