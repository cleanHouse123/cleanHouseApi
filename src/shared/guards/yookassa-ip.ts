/**
 * Адреса, с которых YooKassa шлёт webhook-и.
 * https://yookassa.ru/developers/using-api/webhooks — раздел «IP-адреса».
 */
export const YOOKASSA_WEBHOOK_IPS = [
  '185.71.76.0/27',
  '185.71.77.0/27',
  '77.75.153.0/25',
  '77.75.156.11',
  '77.75.156.35',
  '77.75.154.128/25',
  '2a02:5180::/32',
];

/** IPv4 в число; для не-IPv4 — null */
const toNumber = (ip: string): number | null => {
  const parts = ip.split('.');

  if (parts.length !== 4) {
    return null;
  }

  let result = 0;

  for (const part of parts) {
    const octet = Number(part);

    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      return null;
    }

    result = result * 256 + octet;
  }

  return result;
};

const matches = (ip: string, rule: string): boolean => {
  if (!rule.includes('/')) {
    return ip === rule;
  }

  const [network, bitsRaw] = rule.split('/');
  const bits = Number(bitsRaw);
  const ipNumber = toNumber(ip);
  const networkNumber = toNumber(network);

  // IPv6-подсети сравниваем по префиксу строкой: своих адресов у YooKassa
  // там немного, а тащить парсер ради одного правила незачем
  if (ipNumber === null || networkNumber === null) {
    if (network.includes(':') && ip.includes(':')) {
      const prefix = network.replace(/::$/, '');
      return ip.toLowerCase().startsWith(prefix.toLowerCase());
    }

    return false;
  }

  if (!Number.isInteger(bits) || bits < 0 || bits > 32) {
    return false;
  }

  const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0;

  return (ipNumber & mask) === (networkNumber & mask);
};

/**
 * Пришёл ли запрос с адреса YooKassa.
 *
 * `::ffff:1.2.3.4` — тот же IPv4, просто в IPv6-обёртке: node отдаёт его так,
 * когда слушает оба протокола.
 */
export const isIpAllowed = (
  ip: string | undefined,
  allowList: string[] = YOOKASSA_WEBHOOK_IPS,
): boolean => {
  if (!ip) {
    return false;
  }

  const normalized = ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
  const rules = allowList.length > 0 ? allowList : YOOKASSA_WEBHOOK_IPS;

  return rules.some((rule) => matches(normalized, rule));
};
