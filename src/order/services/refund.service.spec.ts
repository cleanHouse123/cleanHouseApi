import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { RefundService } from './refund.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

/**
 * Возврат денег в YooKassa. Главное, что проверяем: сумма передаётся явно
 * (частичный возврат) и ключ идемпотентности не меняется между попытками,
 * иначе повтор запроса вернул бы деньги дважды.
 */
describe('RefundService', () => {
  const buildService = (env: Record<string, string> = {}) => {
    const configService = {
      get: (key: string) => env[key],
    } as unknown as ConfigService;

    return new RefundService(configService);
  };

  const liveEnv = {
    YOOKASSA_SHOP_ID: '123',
    YOOKASSA_SECRET_KEY: 'live_secret',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.post.mockResolvedValue({
      data: { id: 'rf_1', status: 'succeeded', amount: { value: '159.20' } },
    });
  });

  it('передаёт сумму возврата и реквизиты магазина', async () => {
    const service = buildService(liveEnv);

    const result = await service.createRefund({
      yookassaPaymentId: 'pay_1',
      amountInKopecks: 15920,
      description: 'Возврат по заказу',
    });

    expect(result).toEqual({
      id: 'rf_1',
      status: 'succeeded',
      amountInKopecks: 15920,
    });

    const [url, body, options] = mockedAxios.post.mock.calls[0];
    expect(url).toContain('/refunds');
    expect(body).toMatchObject({
      payment_id: 'pay_1',
      amount: { value: '159.20', currency: 'RUB' },
    });
    expect(options?.auth).toEqual({ username: '123', password: 'live_secret' });
  });

  it('использует тестовые ключи при YOOKASSA_USE_TEST_MODE', async () => {
    const service = buildService({
      ...liveEnv,
      YOOKASSA_USE_TEST_MODE: 'true',
      YOOKASSA_SHOP_ID_TEST: '456',
      YOOKASSA_SECRET_KEY_TEST: 'test_secret',
    });

    await service.createRefund({
      yookassaPaymentId: 'pay_1',
      amountInKopecks: 100,
      description: 'Возврат',
    });

    const [, , options] = mockedAxios.post.mock.calls[0];
    expect(options?.auth).toEqual({ username: '456', password: 'test_secret' });
  });

  it('повтор по той же сумме идёт с тем же ключом идемпотентности', async () => {
    const service = buildService(liveEnv);
    const params = {
      yookassaPaymentId: 'pay_1',
      amountInKopecks: 15920,
      description: 'Возврат',
    };

    await service.createRefund(params);
    await service.createRefund(params);

    const firstKey = mockedAxios.post.mock.calls[0][2]?.headers?.[
      'Idempotence-Key'
    ] as string;
    const secondKey = mockedAxios.post.mock.calls[1][2]?.headers?.[
      'Idempotence-Key'
    ] as string;

    expect(firstKey).toBe(secondKey);
    expect(firstKey).toContain('pay_1');
  });

  it('другая сумма — другой ключ', async () => {
    const service = buildService(liveEnv);

    await service.createRefund({
      yookassaPaymentId: 'pay_1',
      amountInKopecks: 15920,
      description: 'Возврат',
    });
    await service.createRefund({
      yookassaPaymentId: 'pay_1',
      amountInKopecks: 5000,
      description: 'Возврат',
    });

    const keys = mockedAxios.post.mock.calls.map(
      (call) => call[2]?.headers?.['Idempotence-Key'],
    );
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('не ходит в YooKassa в mock-режиме', async () => {
    const service = buildService({
      ...liveEnv,
      YOOKASSA_MOCK_PAYMENTS: 'true',
    });

    const result = await service.createRefund({
      yookassaPaymentId: 'pay_1',
      amountInKopecks: 100,
      description: 'Возврат',
    });

    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(result.status).toBe('succeeded');
  });

  it('отклоняет нулевую сумму', async () => {
    const service = buildService(liveEnv);

    await expect(
      service.createRefund({
        yookassaPaymentId: 'pay_1',
        amountInKopecks: 0,
        description: 'Возврат',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('показывает причину отказа YooKassa', async () => {
    const service = buildService(liveEnv);
    mockedAxios.post.mockRejectedValueOnce({
      response: { data: { description: 'Недостаточно средств на балансе' } },
    });

    await expect(
      service.createRefund({
        yookassaPaymentId: 'pay_1',
        amountInKopecks: 100,
        description: 'Возврат',
      }),
    ).rejects.toThrow('Недостаточно средств на балансе');
  });

  it('объясняет по-русски отказ из-за остатка меньше рубля', async () => {
    const service = buildService(liveEnv);
    mockedAxios.post.mockRejectedValueOnce({
      response: {
        data: {
          description:
            'Refund unsuccessful: the remaining amount after a partial refund should be more than 1 ruble. You can make a full refund',
        },
      },
    });

    await expect(
      service.createRefund({
        yookassaPaymentId: 'pay_1',
        amountInKopecks: 87,
        description: 'Возврат',
      }),
    ).rejects.toThrow('Верните всю сумму или уменьшите возврат');
  });

  it('требует настроенные ключи', async () => {
    const service = buildService({});

    await expect(
      service.createRefund({
        yookassaPaymentId: 'pay_1',
        amountInKopecks: 100,
        description: 'Возврат',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
