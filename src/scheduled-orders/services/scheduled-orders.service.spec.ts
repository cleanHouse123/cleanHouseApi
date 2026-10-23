import { BadRequestException } from '@nestjs/common';
import { ScheduledOrdersService } from './scheduled-orders.service';
import { ScheduleFrequency } from '../entities/scheduled-order.entity';
import { findDueOccurrence } from './schedule-occurrence';

/**
 * Расписание заводится из оформления заказа: первый вынос человек уже заказал
 * руками, и крон не должен создать на него второй такой же заказ.
 */
describe('ScheduledOrdersService.createScheduledOrder', () => {
  const customerId = 'user-1';

  const buildService = (address: unknown = { id: 'addr-1' }) => {
    const saved: Record<string, unknown>[] = [];

    const scheduledOrderRepository = {
      create: jest.fn((value: Record<string, unknown>) => value),
      save: jest.fn(async (value: Record<string, unknown>) => {
        saved.push(value);
        return { ...value, id: 'sch-1' };
      }),
    };
    const userAddressRepository = {
      findOne: jest.fn().mockResolvedValue(address),
    };
    const subscriptionService = {
      getUserActiveSubscription: jest.fn().mockResolvedValue({ id: 'sub-1' }),
    };
    const subscriptionLimitsService = {
      checkOrderLimits: jest.fn().mockResolvedValue({ canCreateOrder: true }),
    };

    const service = Object.create(
      ScheduledOrdersService.prototype,
    ) as ScheduledOrdersService;
    Object.assign(service, {
      scheduledOrderRepository,
      userAddressRepository,
      subscriptionService,
      subscriptionLimitsService,
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    return { service, saved, userAddressRepository };
  };

  const dto = (overrides: Record<string, unknown> = {}) => ({
    address: 'Янино-1, Шоссейная, 7',
    addressId: 'addr-1',
    frequency: ScheduleFrequency.DAILY,
    preferredTime: '10:00',
    startDate: '2026-10-20T07:00:00.000Z', // 10:00 МСК
    ...overrides,
  });

  it('первый вынос уже заказан — повторно его не создаём', async () => {
    const { service, saved } = buildService();

    await service.createScheduledOrder(
      dto({ firstPickupAlreadyOrdered: true }) as never,
      customerId,
    );

    const schedule = saved[0];
    expect(schedule.lastCreatedAt).toEqual(new Date('2026-10-20T07:00:00.000Z'));

    // в тот же день крон ничего не создаст, следующий вынос — завтра
    expect(
      findDueOccurrence(schedule as never, new Date('2026-10-20T00:30:00Z')),
    ).toBeNull();
    expect(
      findDueOccurrence(schedule as never, new Date('2026-10-20T21:30:00Z')),
    ).toEqual(new Date('2026-10-21T07:00:00.000Z'));
  });

  it('без флага расписание работает с первого же дня', async () => {
    const { service, saved } = buildService();

    await service.createScheduledOrder(dto() as never, customerId);

    expect(saved[0].lastCreatedAt).toBeUndefined();
  });

  it('адрес сохраняется для привязки заказов', async () => {
    const { service, saved } = buildService();

    await service.createScheduledOrder(dto() as never, customerId);

    expect(saved[0].addressId).toBe('addr-1');
  });

  it('чужой адрес не принимается', async () => {
    const { service } = buildService(null);

    await expect(
      service.createScheduledOrder(dto() as never, customerId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('без адреса из справочника расписание всё равно создаётся', async () => {
    const { service, saved, userAddressRepository } = buildService();

    await service.createScheduledOrder(
      dto({ addressId: undefined }) as never,
      customerId,
    );

    expect(userAddressRepository.findOne).not.toHaveBeenCalled();
    expect(saved[0].addressId).toBeUndefined();
  });
});
