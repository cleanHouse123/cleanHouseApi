import { parsePhoneNumber, type CountryCode } from 'libphonenumber-js';

/**
 * Normalizes a raw phone string to E.164 format (e.g. +79001234567).
 * Telegram часто присылает номер без "+" (например 375295757080) — добавляем "+" для корректного разбора.
 * @param rawPhone - Phone number as received (e.g. from Telegram contact)
 * @param defaultCountry - Optional default country code (e.g. 'RU') if number has no country code
 * @returns E.164 string
 * @throws Error if the number cannot be parsed
 */
export function normalizePhoneToE164(
  rawPhone: string,
  defaultCountry?: CountryCode,
): string {
  const trimmed = rawPhone.trim();
  // Если номер только цифры (или цифры после +) — считаем международным и добавляем "+" при необходимости
  const toParse =
    trimmed.startsWith('+') ? trimmed : '+' + trimmed.replace(/\D/g, '');
  const parsed = parsePhoneNumber(toParse, defaultCountry ?? 'RU');
  if (!parsed || !parsed.isValid()) {
    throw new Error('Invalid phone number');
  }
  return parsed.format('E.164');
}
