/**
 * Сервис работает по московскому времени: клиент выбирает «вторник, 10:00»
 * и ждёт вынос во вторник утром, а не в понедельник ночью по UTC. В России
 * нет перехода на летнее время с 2014 года, поэтому хватает фиксированного
 * сдвига — тянуть часовые пояса ради этого не нужно.
 */
export const MOSCOW_OFFSET_MINUTES = 180;

const MINUTE = 60 * 1000;

const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/**
 * Дата по-русски и по-московски: «31 октября».
 *
 * Для сообщений клиенту; `toLocaleDateString` не берём, чтобы результат не
 * зависел от локалей, собранных в образе Node.
 */
export const formatMoscowDate = (date: Date | string): string => {
  const moscow = new Date(
    new Date(date).getTime() + MOSCOW_OFFSET_MINUTES * MINUTE,
  );

  return `${moscow.getUTCDate()} ${MONTHS_GENITIVE[moscow.getUTCMonth()]}`;
};
