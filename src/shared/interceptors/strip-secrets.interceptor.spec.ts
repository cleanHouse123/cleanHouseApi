import { stripSecrets, SECRET_FIELDS } from './strip-secrets.interceptor';

/**
 * Хеш пароля и хеш refresh-токена уезжали клиенту внутри заказа: заказ
 * возвращает запись заказчика, а `@Exclude()` на DTO не работал, потому что
 * ответы собираются обычными объектами.
 */
describe('stripSecrets', () => {
  const secretUser = () => ({
    id: 'user-1',
    name: 'Клиент',
    email: 'client@example.com',
    hash_password: '$2b$10$not-a-real-hash',
    refreshTokenHash: '$2b$10$not-a-real-token',
    deviceToken: 'fcm-token',
  });

  it('перечень секретов тот, что ожидается', () => {
    expect([...SECRET_FIELDS]).toEqual([
      'hash_password',
      'refreshTokenHash',
      'deviceToken',
    ]);
  });

  it('срезает секреты и оставляет остальное', () => {
    const result = stripSecrets(secretUser()) as Record<string, unknown>;

    expect(result).toEqual({
      id: 'user-1',
      name: 'Клиент',
      email: 'client@example.com',
    });
  });

  it('достаёт их из вложенных сущностей', () => {
    const order = { id: 'order-1', customer: secretUser() };

    const result = stripSecrets(order);

    expect(result.customer).not.toHaveProperty('hash_password');
    expect(result.customer.name).toBe('Клиент');
  });

  it('проходит по спискам', () => {
    const page = {
      orders: [
        { id: 'o-1', customer: secretUser() },
        { id: 'o-2', currier: secretUser() },
      ],
      total: 2,
    };

    const result = stripSecrets(page);

    expect(result.orders[0].customer).not.toHaveProperty('refreshTokenHash');
    expect(result.orders[1].currier).not.toHaveProperty('refreshTokenHash');
    expect(result.total).toBe(2);
  });

  it('токены авторизации не трогает — у них другие имена', () => {
    const tokens = { accessToken: 'jwt', refreshToken: 'jwt-refresh' };

    expect(stripSecrets({ ...tokens })).toEqual(tokens);
  });

  it('даты остаются датами', () => {
    const createdAt = new Date('2026-10-24T12:00:00.000Z');

    const result = stripSecrets({ createdAt, customer: secretUser() });

    expect(result.createdAt).toBe(createdAt);
  });

  it('примитивы и пустоту переживает', () => {
    expect(stripSecrets(null)).toBeNull();
    expect(stripSecrets(undefined)).toBeUndefined();
    expect(stripSecrets('строка')).toBe('строка');
    expect(stripSecrets(42)).toBe(42);
  });

  it('цикл в объекте не вешает обход', () => {
    const user: Record<string, unknown> = secretUser();
    user.self = user;

    expect(() => stripSecrets(user)).not.toThrow();
    expect(user).not.toHaveProperty('hash_password');
  });
});
