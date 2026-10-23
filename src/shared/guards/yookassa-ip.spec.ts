import { isIpAllowed, YOOKASSA_WEBHOOK_IPS } from './yookassa-ip';

/**
 * Webhook YooKassa не подписывается: единственное подтверждение подлинности —
 * адрес отправителя. Ошибка в обе стороны дорогая: пропустим чужого — заказы
 * станут бесплатными, не пропустим своего — оплаты перестанут подтверждаться.
 */
describe('isIpAllowed', () => {
  it('адрес из подсети YooKassa проходит', () => {
    expect(isIpAllowed('185.71.76.1')).toBe(true);
    expect(isIpAllowed('185.71.77.30')).toBe(true);
    expect(isIpAllowed('77.75.153.100')).toBe(true);
    expect(isIpAllowed('77.75.154.200')).toBe(true);
  });

  it('отдельные адреса из списка проходят', () => {
    expect(isIpAllowed('77.75.156.11')).toBe(true);
    expect(isIpAllowed('77.75.156.35')).toBe(true);
  });

  it('соседние адреса вне подсети не проходят', () => {
    // /27 — это 32 адреса, 185.71.76.32 уже за границей
    expect(isIpAllowed('185.71.76.32')).toBe(false);
    // /25 — 128 адресов, 77.75.153.128 за границей
    expect(isIpAllowed('77.75.153.128')).toBe(false);
    expect(isIpAllowed('77.75.156.12')).toBe(false);
  });

  it('чужие адреса не проходят', () => {
    expect(isIpAllowed('1.2.3.4')).toBe(false);
    expect(isIpAllowed('127.0.0.1')).toBe(false);
    expect(isIpAllowed('185.71.78.1')).toBe(false);
  });

  it('без адреса пропускать нельзя', () => {
    expect(isIpAllowed(undefined)).toBe(false);
    expect(isIpAllowed('')).toBe(false);
  });

  it('IPv4 в IPv6-обёртке разворачивается', () => {
    expect(isIpAllowed('::ffff:185.71.76.1')).toBe(true);
    expect(isIpAllowed('::ffff:1.2.3.4')).toBe(false);
  });

  it('IPv6-подсеть YooKassa проходит', () => {
    expect(isIpAllowed('2a02:5180:0:1::5')).toBe(true);
    expect(isIpAllowed('2a03:5180:0:1::5')).toBe(false);
  });

  it('мусор вместо адреса не проходит', () => {
    expect(isIpAllowed('не адрес')).toBe(false);
    expect(isIpAllowed('999.999.999.999')).toBe(false);
  });

  it('свой список адресов заменяет встроенный', () => {
    expect(isIpAllowed('10.0.0.1', ['10.0.0.0/8'])).toBe(true);
    expect(isIpAllowed('185.71.76.1', ['10.0.0.0/8'])).toBe(false);
  });

  it('встроенный список не пустой', () => {
    expect(YOOKASSA_WEBHOOK_IPS.length).toBeGreaterThan(0);
  });
});
