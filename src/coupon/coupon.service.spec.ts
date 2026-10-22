/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CouponService } from './coupon.service';
import { PriceService } from '../price/price.service';
import {
  Coupon,
  CouponDiscountType,
  CouponScope,
} from './entities/coupon.entity';
import { CouponRedemption } from './entities/coupon-redemption.entity';
import { SubscriptionPlan } from '../subscription/entities/subscription-plan.entity';
import {
  CouponNotFoundError,
  CouponExpiredError,
  CouponScopeMismatchError,
  CouponPlanMismatchError,
  CouponMinAmountError,
  CouponAlreadyUsedError,
  CouponLimitReachedError,
} from './coupon.errors';

const activeCoupon = (over: Partial<Coupon> = {}): Coupon =>
  ({
    id: 'c1',
    code: 'KVARTAL1',
    description: null,
    scope: CouponScope.SUBSCRIPTION,
    discountType: CouponDiscountType.FINAL_PRICE,
    value: 100,
    isActive: true,
    startsAt: null,
    endsAt: null,
    maxRedemptions: null,
    redeemedCount: 0,
    minAmount: null,
    subscriptionPlanId: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  }) as Coupon;

describe('CouponService.validate', () => {
  let service: CouponService;
  let couponRepo: any;
  let priceService: any;
  let redemptionRepo: any;

  beforeEach(async () => {
    couponRepo = { findOne: jest.fn() };
    priceService = { getOrderPrice: jest.fn() };
    redemptionRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CouponService,
        { provide: getRepositoryToken(Coupon), useValue: couponRepo },
        {
          provide: getRepositoryToken(CouponRedemption),
          useValue: redemptionRepo,
        },
        { provide: getRepositoryToken(SubscriptionPlan), useValue: {} },
        { provide: DataSource, useValue: {} },
        { provide: PriceService, useValue: priceService },
      ],
    }).compile();
    service = moduleRef.get(CouponService);
  });

  it('unknown code -> CouponNotFoundError', async () => {
    couponRepo.findOne.mockResolvedValue(null);
    await expect(
      service.validate('NOPE', CouponScope.SUBSCRIPTION, 'u1', 20000, null),
    ).rejects.toBeInstanceOf(CouponNotFoundError);
  });

  it('normalizes code to uppercase in lookup', async () => {
    couponRepo.findOne.mockResolvedValue(activeCoupon());
    await service.validate(
      'kvartal1',
      CouponScope.SUBSCRIPTION,
      'u1',
      20000,
      null,
    );
    expect(couponRepo.findOne).toHaveBeenCalledWith({
      where: { code: 'KVARTAL1' },
    });
  });

  it('expired -> CouponExpiredError', async () => {
    couponRepo.findOne.mockResolvedValue(activeCoupon({ endsAt: new Date(1) }));
    await expect(
      service.validate('KVARTAL1', CouponScope.SUBSCRIPTION, 'u1', 20000, null),
    ).rejects.toBeInstanceOf(CouponExpiredError);
  });

  it('scope mismatch -> CouponScopeMismatchError', async () => {
    couponRepo.findOne.mockResolvedValue(
      activeCoupon({ scope: CouponScope.ORDER }),
    );
    await expect(
      service.validate('KVARTAL1', CouponScope.SUBSCRIPTION, 'u1', 20000, null),
    ).rejects.toBeInstanceOf(CouponScopeMismatchError);
  });

  it('plan mismatch -> CouponPlanMismatchError', async () => {
    couponRepo.findOne.mockResolvedValue(
      activeCoupon({ subscriptionPlanId: 'planA' }),
    );
    await expect(
      service.validate(
        'KVARTAL1',
        CouponScope.SUBSCRIPTION,
        'u1',
        20000,
        'planB',
      ),
    ).rejects.toBeInstanceOf(CouponPlanMismatchError);
  });

  it('below minAmount -> CouponMinAmountError', async () => {
    couponRepo.findOne.mockResolvedValue(activeCoupon({ minAmount: 30000 }));
    await expect(
      service.validate('KVARTAL1', CouponScope.SUBSCRIPTION, 'u1', 20000, null),
    ).rejects.toBeInstanceOf(CouponMinAmountError);
  });

  it('already redeemed by user -> CouponAlreadyUsedError', async () => {
    couponRepo.findOne.mockResolvedValue(activeCoupon());
    redemptionRepo.findOne.mockResolvedValue({ id: 'r1' });
    await expect(
      service.validate('KVARTAL1', CouponScope.SUBSCRIPTION, 'u1', 20000, null),
    ).rejects.toBeInstanceOf(CouponAlreadyUsedError);
  });

  it('valid -> returns preview with finalAmount', async () => {
    couponRepo.findOne.mockResolvedValue(activeCoupon());
    const res = await service.validate(
      'KVARTAL1',
      CouponScope.SUBSCRIPTION,
      'u1',
      20000,
      null,
    );
    expect(res).toEqual({
      coupon: expect.objectContaining({ id: 'c1' }),
      baseAmount: 20000,
      finalAmount: 100,
      discountAmount: 19900,
    });
  });
});

describe('CouponService.reserve', () => {
  let service: CouponService;
  let manager: any;
  let qr: any;

  const buildUpdateChain = (affected: number) => ({
    update: () => ({
      set: () => ({
        where: () => ({
          andWhere: () => ({ execute: async () => ({ affected }) }),
        }),
      }),
    }),
  });

  const makeService = async () => {
    manager = {
      findOne: jest.fn(),
      decrement: jest.fn(),
      delete: jest.fn(),
      create: (_e: any, v: any) => v,
      save: jest.fn(async (_e: any, v: any) => ({ id: 'r1', ...v })),
      createQueryBuilder: jest.fn(),
    };
    qr = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager,
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CouponService,
        {
          provide: getRepositoryToken(Coupon),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(CouponRedemption),
          useValue: { findOne: jest.fn(), find: jest.fn() },
        },
        { provide: getRepositoryToken(SubscriptionPlan), useValue: {} },
        { provide: DataSource, useValue: { createQueryRunner: () => qr } },
        {
          provide: PriceService,
          useValue: { getOrderPrice: jest.fn() },
        },
      ],
    }).compile();
    service = moduleRef.get(CouponService);
  };

  it('increments cap atomically, inserts reserved row, commits', async () => {
    await makeService();
    const coupon = activeCoupon({ maxRedemptions: 100, redeemedCount: 0 });
    manager.findOne.mockImplementation((entity: any) =>
      Promise.resolve(entity === Coupon ? coupon : null),
    );
    manager.createQueryBuilder.mockReturnValue(buildUpdateChain(1));
    const res = await service.reserve(
      'KVARTAL1',
      CouponScope.SUBSCRIPTION,
      'u1',
      20000,
      null,
      { subscriptionId: 's1' },
    );
    expect(res.finalAmount).toBe(100);
    expect(res.redemptionId).toBe('r1');
    expect(manager.save).toHaveBeenCalled();
    expect(qr.commitTransaction).toHaveBeenCalled();
  });

  it('throws CouponLimitReachedError and rolls back when cap update affects 0 rows (lost race)', async () => {
    await makeService();
    // Passes the in-memory check (0 < 1) but a concurrent reserve already took
    // the last slot, so the atomic conditional UPDATE affects 0 rows.
    const coupon = activeCoupon({ maxRedemptions: 1, redeemedCount: 0 });
    manager.findOne.mockImplementation((entity: any) =>
      Promise.resolve(entity === Coupon ? coupon : null),
    );
    manager.createQueryBuilder.mockReturnValue(buildUpdateChain(0));
    await expect(
      service.reserve('KVARTAL1', CouponScope.SUBSCRIPTION, 'u1', 20000, null, {
        subscriptionId: 's1',
      }),
    ).rejects.toBeInstanceOf(CouponLimitReachedError);
    expect(qr.rollbackTransaction).toHaveBeenCalled();
  });
});

describe('CouponService.validateForPreview — превью для заказа', () => {
  let service: CouponService;
  let couponRepo: any;
  let priceService: any;

  beforeEach(async () => {
    couponRepo = { findOne: jest.fn() };
    priceService = { getOrderPrice: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CouponService,
        { provide: getRepositoryToken(Coupon), useValue: couponRepo },
        {
          provide: getRepositoryToken(CouponRedemption),
          useValue: { findOne: jest.fn().mockResolvedValue(null) },
        },
        { provide: getRepositoryToken(SubscriptionPlan), useValue: {} },
        { provide: DataSource, useValue: {} },
        { provide: PriceService, useValue: priceService },
      ],
    }).compile();
    service = moduleRef.get(CouponService);
  });

  it('считает скидку от цены без автоскидки первого заказа', async () => {
    couponRepo.findOne.mockResolvedValue(
      activeCoupon({
        scope: CouponScope.ORDER,
        discountType: CouponDiscountType.PERCENT,
        value: 10,
      }),
    );
    // первый вызов — база для купона, второй — цена без купона
    priceService.getOrderPrice
      .mockResolvedValueOnce(20000)
      .mockResolvedValueOnce(100);

    const res = await service.validateForPreview(
      { code: 'KVARTAL1', scope: CouponScope.ORDER, numberPackages: 2 } as any,
      'u1',
    );

    expect(res).toEqual({
      valid: true,
      baseAmount: 20000,
      finalAmount: 18000,
      discountAmount: 2000,
      priceWithoutCoupon: 100,
    });
    expect(priceService.getOrderPrice).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ skipFirstOrderDiscount: true }),
    );
    expect(priceService.getOrderPrice).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ skipFirstOrderDiscount: false }),
    );
  });

  it('передаёт адрес и количество пакетов в расчёт цены', async () => {
    couponRepo.findOne.mockResolvedValue(
      activeCoupon({
        scope: CouponScope.BOTH,
        discountType: CouponDiscountType.FIXED_AMOUNT,
        value: 5000,
      }),
    );
    priceService.getOrderPrice.mockResolvedValue(30000);

    await service.validateForPreview(
      {
        code: 'KVARTAL1',
        scope: CouponScope.ORDER,
        numberPackages: 4,
        addressId: 'a1',
      } as any,
      'u1',
    );

    expect(priceService.getOrderPrice).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        numberPackages: 4,
        addressId: 'a1',
      }),
    );
  });
});
