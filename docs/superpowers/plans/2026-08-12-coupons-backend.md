# Coupons — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend coupon engine (`backend-mussor`) that discounts subscriptions and orders, per `docs/superpowers/specs/2026-08-12-coupons-design.md`.

**Architecture:** Dedicated NestJS `coupon` module (TypeORM/Postgres). Pure pricing math + a reserve→confirm→release redemption lifecycle. Injected into the existing server-side price-computation points in `OrderService` and the subscription `PaymentService`. Money in integer kopecks. Admin CRUD guarded by `JwtAuthGuard + AdminGuard`; a client `POST /coupons/validate` preview endpoint.

**Tech Stack:** NestJS 11, TypeORM 0.3, Postgres, class-validator, Jest + ts-jest, YooKassa (`nestjs-yookassa`), `@nestjs/schedule`.

**Notes for the implementer:**
- The repo has Jest configured (`package.json` `jest` block, `rootDir: src`, `testRegex: .*\.spec\.ts$`) but **no `test` script and zero existing specs**. Task 0 adds the script.
- Pure-logic tests (Tasks 4–6 unit parts) need no DB and are the priority. DB-backed integration tests run against the docker dev-db (`yarn db:up`).
- `synchronize` auto-creates tables in dev; prod needs the migration from Task 2.
- Run tests with `npx jest <path>`; build with `yarn build`; lint with `yarn lint`.

---

### Task 0: Test script + baseline

**Files:**
- Modify: `package.json` (scripts)

- [ ] **Step 1: Add test scripts**

In `package.json` `"scripts"` add:
```json
"test": "jest",
"test:watch": "jest --watch"
```

- [ ] **Step 2: Verify jest runs (no tests yet = passes with "no tests found")**

Run: `npx jest --passWithNoTests`
Expected: exits 0, "No tests found, exiting with code 0".

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add jest test script"
```

---

### Task 1: Coupon entities

**Files:**
- Create: `src/coupon/entities/coupon.entity.ts`
- Create: `src/coupon/entities/coupon-redemption.entity.ts`

- [ ] **Step 1: Create `coupon.entity.ts`**

```ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum CouponScope {
  SUBSCRIPTION = 'subscription',
  ORDER = 'order',
  BOTH = 'both',
}

export enum CouponDiscountType {
  PERCENT = 'percent',
  FIXED_AMOUNT = 'fixed_amount',
  FINAL_PRICE = 'final_price',
}

@Entity('coupons')
export class Coupon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  code: string; // stored normalized: trim + UPPERCASE

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: CouponScope })
  scope: CouponScope;

  @Column({ type: 'enum', enum: CouponDiscountType })
  discountType: CouponDiscountType;

  @Column('integer')
  value: number; // percent 1..100, or kopecks

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  startsAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  endsAt: Date | null;

  @Column({ type: 'integer', nullable: true })
  maxRedemptions: number | null; // null = unlimited

  @Column({ type: 'integer', default: 0 })
  redeemedCount: number;

  @Column({ type: 'integer', nullable: true })
  minAmount: number | null; // kopecks

  @Column({ type: 'uuid', nullable: true })
  subscriptionPlanId: string | null; // restrict subscription coupon to one plan

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

- [ ] **Step 2: Create `coupon-redemption.entity.ts`**

```ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum CouponRedemptionStatus {
  RESERVED = 'reserved',
  CONFIRMED = 'confirmed',
}

@Entity('coupon_redemptions')
@Index(['couponId', 'userId'], { unique: true })
export class CouponRedemption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  couponId: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: CouponRedemptionStatus })
  status: CouponRedemptionStatus;

  @Column({ type: 'uuid', nullable: true })
  orderId: string | null;

  @Column({ type: 'uuid', nullable: true })
  subscriptionId: string | null;

  @Column('integer')
  amountBefore: number;

  @Column('integer')
  amountAfter: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

- [ ] **Step 3: Build to confirm entities compile**

Run: `yarn build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/coupon/entities
git commit -m "feat(coupon): add Coupon and CouponRedemption entities"
```

---

### Task 2: DataSource + migrations pipeline + initial migration

**Files:**
- Create: `src/data-source.ts`
- Modify: `src/app.module.ts:57-85` (enable migrations, register entities)
- Modify: `package.json` (typeorm CLI scripts)
- Create: `src/migrations/<timestamp>-CreateCoupons.ts` (generated)

- [ ] **Step 1: Create `src/data-source.ts`** (standalone DataSource for the TypeORM CLI; mirrors `app.module.ts` connection)

```ts
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config({ path: `.env.${process.env.NODE_ENV || 'development'}` });

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT),
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});
```

- [ ] **Step 2: Add typeorm CLI scripts to `package.json`**

```json
"typeorm": "typeorm-ts-node-commonjs -d src/data-source.ts",
"migration:generate": "yarn typeorm migration:generate",
"migration:run": "yarn typeorm migration:run",
"migration:revert": "yarn typeorm migration:revert"
```

- [ ] **Step 3: Register entities + enable prod migrations in `app.module.ts`**

In the `entities: [...]` array (around line 67) add `Coupon` and `CouponRedemption` (and their imports at top). Replace the commented migration lines (60-61) with:
```ts
          migrations: ['dist/migrations/*.js'],
          migrationsRun: process.env.NODE_ENV === 'production',
```
Leave `synchronize` as-is (dev auto-syncs; prod runs migrations).

- [ ] **Step 4: Generate the migration against a dev DB**

Run:
```bash
yarn db:up
yarn migration:generate src/migrations/CreateCoupons
```
Expected: a migration file creating `coupons` + `coupon_redemptions` with the unique index on `(couponId,userId)` and the unique index on `code`.

- [ ] **Step 5: Verify migration applies cleanly on a fresh DB**

Run: `yarn migration:run`
Expected: migration executes, tables created. (If dev DB already has them via synchronize, test on a fresh DB or trust the generated SQL — note in commit.)

- [ ] **Step 6: Build + commit**

Run: `yarn build`
```bash
git add src/data-source.ts src/migrations package.json src/app.module.ts
git commit -m "feat(coupon): register entities + enable migrations pipeline"
```

---

### Task 3: computeFinalAmount (pure logic, TDD)

**Files:**
- Create: `src/coupon/coupon-pricing.ts`
- Test: `src/coupon/coupon-pricing.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { computeFinalAmount } from './coupon-pricing';
import { Coupon, CouponDiscountType, CouponScope } from './entities/coupon.entity';

const base = (over: Partial<Coupon>): Coupon =>
  ({ discountType: CouponDiscountType.PERCENT, value: 0, scope: CouponScope.BOTH, ...over } as Coupon);

describe('computeFinalAmount', () => {
  it('percent: 20% off 20000 = 16000', () => {
    expect(computeFinalAmount(base({ discountType: CouponDiscountType.PERCENT, value: 20 }), 20000)).toBe(16000);
  });
  it('percent: rounds to nearest kopeck', () => {
    expect(computeFinalAmount(base({ discountType: CouponDiscountType.PERCENT, value: 33 }), 14900)).toBe(9983);
  });
  it('fixed_amount: subtracts kopecks', () => {
    expect(computeFinalAmount(base({ discountType: CouponDiscountType.FIXED_AMOUNT, value: 5000 }), 20000)).toBe(15000);
  });
  it('final_price: sets the price', () => {
    expect(computeFinalAmount(base({ discountType: CouponDiscountType.FINAL_PRICE, value: 100 }), 20000)).toBe(100);
  });
  it('clamps to min 100 (1 rub) when computed below', () => {
    expect(computeFinalAmount(base({ discountType: CouponDiscountType.FINAL_PRICE, value: 0 }), 20000)).toBe(100);
    expect(computeFinalAmount(base({ discountType: CouponDiscountType.PERCENT, value: 100 }), 20000)).toBe(100);
  });
  it('clamps to base when computed above (fixed_amount negative / final_price too high)', () => {
    expect(computeFinalAmount(base({ discountType: CouponDiscountType.FIXED_AMOUNT, value: 999999 }), 20000)).toBe(100);
    expect(computeFinalAmount(base({ discountType: CouponDiscountType.FINAL_PRICE, value: 999999 }), 20000)).toBe(20000);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/coupon/coupon-pricing.spec.ts`
Expected: FAIL — `computeFinalAmount` not found.

- [ ] **Step 3: Implement `coupon-pricing.ts`**

```ts
import { Coupon, CouponDiscountType } from './entities/coupon.entity';

export const COUPON_MIN_AMOUNT = 100; // 1 rub in kopecks

export function computeFinalAmount(coupon: Coupon, baseAmount: number): number {
  let computed: number;
  switch (coupon.discountType) {
    case CouponDiscountType.PERCENT:
      computed = Math.round((baseAmount * (100 - coupon.value)) / 100);
      break;
    case CouponDiscountType.FIXED_AMOUNT:
      computed = baseAmount - coupon.value;
      break;
    case CouponDiscountType.FINAL_PRICE:
      computed = coupon.value;
      break;
    default:
      computed = baseAmount;
  }
  return Math.max(COUPON_MIN_AMOUNT, Math.min(computed, baseAmount));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/coupon/coupon-pricing.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/coupon/coupon-pricing.ts src/coupon/coupon-pricing.spec.ts
git commit -m "feat(coupon): add computeFinalAmount pricing with clamping"
```

---

### Task 4: Coupon errors + validation (TDD, mocked repo)

**Files:**
- Create: `src/coupon/coupon.errors.ts`
- Create: `src/coupon/coupon.service.ts` (validate part)
- Test: `src/coupon/coupon.service.spec.ts`

- [ ] **Step 1: Create typed errors `coupon.errors.ts`**

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';

export class CouponNotFoundError extends NotFoundException {
  constructor() { super('Промокод не найден'); }
}
export class CouponInactiveError extends BadRequestException {
  constructor() { super('Промокод недоступен'); }
}
export class CouponExpiredError extends BadRequestException {
  constructor() { super('Срок действия промокода истёк'); }
}
export class CouponScopeMismatchError extends BadRequestException {
  constructor() { super('Промокод не применим к этой покупке'); }
}
export class CouponPlanMismatchError extends BadRequestException {
  constructor() { super('Промокод не применим к этому плану'); }
}
export class CouponMinAmountError extends BadRequestException {
  constructor() { super('Сумма покупки меньше минимальной для промокода'); }
}
export class CouponAlreadyUsedError extends BadRequestException {
  constructor() { super('Вы уже использовали этот промокод'); }
}
export class CouponLimitReachedError extends BadRequestException {
  constructor() { super('Лимit использований промокода исчерпан'); }
}
```

- [ ] **Step 2: Write the failing validation test**

```ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CouponService } from './coupon.service';
import { Coupon, CouponDiscountType, CouponScope } from './entities/coupon.entity';
import { CouponRedemption } from './entities/coupon-redemption.entity';
import {
  CouponNotFoundError, CouponExpiredError, CouponScopeMismatchError,
  CouponPlanMismatchError, CouponMinAmountError, CouponAlreadyUsedError,
} from './coupon.errors';

const activeCoupon = (over: Partial<Coupon> = {}): Coupon => ({
  id: 'c1', code: 'KVARTAL1', description: null,
  scope: CouponScope.SUBSCRIPTION, discountType: CouponDiscountType.FINAL_PRICE,
  value: 100, isActive: true, startsAt: null, endsAt: null,
  maxRedemptions: null, redeemedCount: 0, minAmount: null,
  subscriptionPlanId: null, createdAt: new Date(0), updatedAt: new Date(0), ...over,
} as Coupon);

describe('CouponService.validate', () => {
  let service: CouponService;
  let couponRepo: any;
  let redemptionRepo: any;

  beforeEach(async () => {
    couponRepo = { findOne: jest.fn() };
    redemptionRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CouponService,
        { provide: getRepositoryToken(Coupon), useValue: couponRepo },
        { provide: getRepositoryToken(CouponRedemption), useValue: redemptionRepo },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(CouponService);
  });

  it('unknown code -> CouponNotFoundError', async () => {
    couponRepo.findOne.mockResolvedValue(null);
    await expect(service.validate('NOPE', CouponScope.SUBSCRIPTION, 'u1', 20000, null))
      .rejects.toBeInstanceOf(CouponNotFoundError);
  });

  it('normalizes code to uppercase in lookup', async () => {
    couponRepo.findOne.mockResolvedValue(activeCoupon());
    await service.validate('kvartal1', CouponScope.SUBSCRIPTION, 'u1', 20000, null);
    expect(couponRepo.findOne).toHaveBeenCalledWith({ where: { code: 'KVARTAL1' } });
  });

  it('expired -> CouponExpiredError', async () => {
    couponRepo.findOne.mockResolvedValue(activeCoupon({ endsAt: new Date(1) }));
    await expect(service.validate('KVARTAL1', CouponScope.SUBSCRIPTION, 'u1', 20000, null))
      .rejects.toBeInstanceOf(CouponExpiredError);
  });

  it('scope mismatch -> CouponScopeMismatchError', async () => {
    couponRepo.findOne.mockResolvedValue(activeCoupon({ scope: CouponScope.ORDER }));
    await expect(service.validate('KVARTAL1', CouponScope.SUBSCRIPTION, 'u1', 20000, null))
      .rejects.toBeInstanceOf(CouponScopeMismatchError);
  });

  it('plan mismatch -> CouponPlanMismatchError', async () => {
    couponRepo.findOne.mockResolvedValue(activeCoupon({ subscriptionPlanId: 'planA' }));
    await expect(service.validate('KVARTAL1', CouponScope.SUBSCRIPTION, 'u1', 20000, 'planB'))
      .rejects.toBeInstanceOf(CouponPlanMismatchError);
  });

  it('below minAmount -> CouponMinAmountError', async () => {
    couponRepo.findOne.mockResolvedValue(activeCoupon({ minAmount: 30000 }));
    await expect(service.validate('KVARTAL1', CouponScope.SUBSCRIPTION, 'u1', 20000, null))
      .rejects.toBeInstanceOf(CouponMinAmountError);
  });

  it('already redeemed by user -> CouponAlreadyUsedError', async () => {
    couponRepo.findOne.mockResolvedValue(activeCoupon());
    redemptionRepo.findOne.mockResolvedValue({ id: 'r1' });
    await expect(service.validate('KVARTAL1', CouponScope.SUBSCRIPTION, 'u1', 20000, null))
      .rejects.toBeInstanceOf(CouponAlreadyUsedError);
  });

  it('valid -> returns preview with finalAmount', async () => {
    couponRepo.findOne.mockResolvedValue(activeCoupon());
    const res = await service.validate('KVARTAL1', CouponScope.SUBSCRIPTION, 'u1', 20000, null);
    expect(res).toEqual({ coupon: expect.objectContaining({ id: 'c1' }), baseAmount: 20000, finalAmount: 100, discountAmount: 19900 });
  });
});
```

- [ ] **Step 2b: Run to verify it fails**

Run: `npx jest src/coupon/coupon.service.spec.ts`
Expected: FAIL — `CouponService` has no `validate`.

- [ ] **Step 3: Implement `coupon.service.ts` (validate + helpers)**

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, IsNull } from 'typeorm';
import { Coupon, CouponScope } from './entities/coupon.entity';
import { CouponRedemption, CouponRedemptionStatus } from './entities/coupon-redemption.entity';
import { computeFinalAmount } from './coupon-pricing';
import {
  CouponNotFoundError, CouponInactiveError, CouponExpiredError,
  CouponScopeMismatchError, CouponPlanMismatchError, CouponMinAmountError,
  CouponAlreadyUsedError, CouponLimitReachedError,
} from './coupon.errors';

export interface CouponValidation {
  coupon: Coupon;
  baseAmount: number;
  finalAmount: number;
  discountAmount: number;
}

export const normalizeCode = (code: string): string => code.trim().toUpperCase();

@Injectable()
export class CouponService {
  constructor(
    @InjectRepository(Coupon)
    private readonly couponRepo: Repository<Coupon>,
    @InjectRepository(CouponRedemption)
    private readonly redemptionRepo: Repository<CouponRedemption>,
    private readonly dataSource: DataSource,
  ) {}

  private scopeMatches(coupon: Coupon, scope: CouponScope): boolean {
    return coupon.scope === CouponScope.BOTH || coupon.scope === scope;
  }

  private assertUsable(coupon: Coupon | null, scope: CouponScope, baseAmount: number, planId: string | null): Coupon {
    if (!coupon) throw new CouponNotFoundError();
    if (!coupon.isActive) throw new CouponInactiveError();
    const now = Date.now();
    if (coupon.startsAt && coupon.startsAt.getTime() > now) throw new CouponExpiredError();
    if (coupon.endsAt && coupon.endsAt.getTime() < now) throw new CouponExpiredError();
    if (!this.scopeMatches(coupon, scope)) throw new CouponScopeMismatchError();
    if (scope === CouponScope.SUBSCRIPTION && coupon.subscriptionPlanId && coupon.subscriptionPlanId !== planId) {
      throw new CouponPlanMismatchError();
    }
    if (coupon.minAmount != null && baseAmount < coupon.minAmount) throw new CouponMinAmountError();
    if (coupon.maxRedemptions != null && coupon.redeemedCount >= coupon.maxRedemptions) {
      throw new CouponLimitReachedError();
    }
    return coupon;
  }

  async validate(
    code: string, scope: CouponScope, userId: string, baseAmount: number, planId: string | null,
  ): Promise<CouponValidation> {
    const coupon = await this.couponRepo.findOne({ where: { code: normalizeCode(code) } });
    this.assertUsable(coupon, scope, baseAmount, planId);
    const existing = await this.redemptionRepo.findOne({ where: { couponId: coupon!.id, userId } });
    if (existing) throw new CouponAlreadyUsedError();
    const finalAmount = computeFinalAmount(coupon!, baseAmount);
    return { coupon: coupon!, baseAmount, finalAmount, discountAmount: baseAmount - finalAmount };
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/coupon/coupon.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/coupon/coupon.errors.ts src/coupon/coupon.service.ts src/coupon/coupon.service.spec.ts
git commit -m "feat(coupon): add typed errors and validate()"
```

---

### Task 5: reserve / confirm / release (transactional lifecycle)

**Files:**
- Modify: `src/coupon/coupon.service.ts`
- Test: `src/coupon/coupon.service.spec.ts` (add lifecycle cases)

- [ ] **Step 1: Add lifecycle tests (mock queryRunner/manager)**

Append to `coupon.service.spec.ts`:
```ts
describe('CouponService.reserve/confirm/release', () => {
  let service: CouponService;
  let couponRepo: any; let redemptionRepo: any; let manager: any; let qr: any; let dataSource: any;

  beforeEach(async () => {
    couponRepo = { findOne: jest.fn() };
    redemptionRepo = { findOne: jest.fn().mockResolvedValue(null), update: jest.fn() };
    manager = {
      findOne: jest.fn(),
      increment: jest.fn(),
      decrement: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      create: (_e: any, v: any) => v,
      save: jest.fn(async (_e: any, v: any) => ({ id: 'r1', ...v })),
      createQueryBuilder: jest.fn(),
    };
    qr = { connect: jest.fn(), startTransaction: jest.fn(), commitTransaction: jest.fn(), rollbackTransaction: jest.fn(), release: jest.fn(), manager };
    dataSource = { createQueryRunner: () => qr };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CouponService,
        { provide: getRepositoryToken(Coupon), useValue: couponRepo },
        { provide: getRepositoryToken(CouponRedemption), useValue: redemptionRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = moduleRef.get(CouponService);
  });

  it('reserve increments cap atomically and inserts reserved row', async () => {
    manager.findOne.mockResolvedValue(activeCoupon({ maxRedemptions: 100, redeemedCount: 0 }));
    // atomic UPDATE returns affected 1
    manager.createQueryBuilder.mockReturnValue({
      update: () => ({ set: () => ({ where: () => ({ andWhere: () => ({ execute: async () => ({ affected: 1 }) }) }) }) }),
    });
    const res = await service.reserve('KVARTAL1', CouponScope.SUBSCRIPTION, 'u1', 20000, null, { subscriptionId: 's1' });
    expect(res.finalAmount).toBe(100);
    expect(manager.save).toHaveBeenCalled();
    expect(qr.commitTransaction).toHaveBeenCalled();
  });

  it('reserve throws CouponLimitReachedError when atomic update affects 0 rows', async () => {
    manager.findOne.mockResolvedValue(activeCoupon({ maxRedemptions: 1, redeemedCount: 1 }));
    manager.createQueryBuilder.mockReturnValue({
      update: () => ({ set: () => ({ where: () => ({ andWhere: () => ({ execute: async () => ({ affected: 0 }) }) }) }) }),
    });
    await expect(service.reserve('KVARTAL1', CouponScope.SUBSCRIPTION, 'u1', 20000, null, { subscriptionId: 's1' }))
      .rejects.toBeInstanceOf(CouponLimitReachedError);
    expect(qr.rollbackTransaction).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/coupon/coupon.service.spec.ts`
Expected: FAIL — no `reserve`.

- [ ] **Step 3: Implement reserve/confirm/release**

Add to `CouponService`:
```ts
  async reserve(
    code: string, scope: CouponScope, userId: string, baseAmount: number, planId: string | null,
    target: { orderId?: string; subscriptionId?: string },
  ): Promise<CouponValidation & { redemptionId: string }> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const m = qr.manager;
      const coupon = await m.findOne(Coupon, { where: { code: normalizeCode(code) } });
      this.assertUsable(coupon, scope, baseAmount, planId);

      // Atomic global-cap capture
      const upd = await m.createQueryBuilder()
        .update(Coupon)
        .set({ redeemedCount: () => 'redeemedCount + 1' })
        .where('id = :id', { id: coupon!.id })
        .andWhere('(maxRedemptions IS NULL OR redeemedCount < maxRedemptions)')
        .execute();
      if (!upd.affected) throw new CouponLimitReachedError();

      const finalAmount = computeFinalAmount(coupon!, baseAmount);
      const redemption = await m.save(CouponRedemption, m.create(CouponRedemption, {
        couponId: coupon!.id,
        userId,
        status: CouponRedemptionStatus.RESERVED,
        orderId: target.orderId ?? null,
        subscriptionId: target.subscriptionId ?? null,
        amountBefore: baseAmount,
        amountAfter: finalAmount,
      }));

      await qr.commitTransaction();
      return { coupon: coupon!, baseAmount, finalAmount, discountAmount: baseAmount - finalAmount, redemptionId: redemption.id };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  // Idempotent: confirm a reserved redemption on successful payment
  async confirmBy(where: { orderId?: string; subscriptionId?: string }): Promise<void> {
    await this.redemptionRepo.update(
      { ...where, status: CouponRedemptionStatus.RESERVED },
      { status: CouponRedemptionStatus.CONFIRMED },
    );
  }

  // Release a reserved redemption (payment failed/canceled/expired); frees the slot
  async releaseBy(where: { orderId?: string; subscriptionId?: string }): Promise<void> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const m = qr.manager;
      const row = await m.findOne(CouponRedemption, { where: { ...where, status: CouponRedemptionStatus.RESERVED } });
      if (row) {
        await m.delete(CouponRedemption, { id: row.id });
        await m.decrement(Coupon, { id: row.couponId }, 'redeemedCount', 1);
      }
      await qr.commitTransaction();
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async releaseStale(olderThanMinutes: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
    const stale = await this.redemptionRepo.find({
      where: { status: CouponRedemptionStatus.RESERVED },
    });
    let released = 0;
    for (const row of stale) {
      if (row.createdAt < cutoff) {
        await this.releaseBy(row.orderId ? { orderId: row.orderId } : { subscriptionId: row.subscriptionId! });
        released++;
      }
    }
    return released;
  }
```
Add `find` to the repo mock in earlier tests if needed (`redemptionRepo.find = jest.fn()`).

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/coupon/coupon.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/coupon/coupon.service.ts src/coupon/coupon.service.spec.ts
git commit -m "feat(coupon): reserve/confirm/release lifecycle"
```

---

### Task 6: DTOs + CouponController + CouponModule

**Files:**
- Create: `src/coupon/dto/create-coupon.dto.ts`, `update-coupon.dto.ts`, `validate-coupon.dto.ts`, `coupon-response.dto.ts`
- Create: `src/coupon/coupon.controller.ts`
- Create: `src/coupon/coupon.module.ts`
- Modify: `src/app.module.ts` (import CouponModule)
- Modify: `src/coupon/coupon.service.ts` (CRUD methods)

- [ ] **Step 1: Create DTOs**

`create-coupon.dto.ts`:
```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min, MaxLength,
  IsDateString,
} from 'class-validator';
import { CouponScope, CouponDiscountType } from '../entities/coupon.entity';

export class CreateCouponDto {
  @ApiProperty() @IsString() @MaxLength(64) code: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: CouponScope }) @IsEnum(CouponScope) scope: CouponScope;
  @ApiProperty({ enum: CouponDiscountType }) @IsEnum(CouponDiscountType) discountType: CouponDiscountType;
  @ApiProperty() @IsInt() @Min(0) value: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) maxRedemptions?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) minAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID() subscriptionPlanId?: string;
}
```
`update-coupon.dto.ts`:
```ts
import { PartialType } from '@nestjs/swagger';
import { CreateCouponDto } from './create-coupon.dto';
export class UpdateCouponDto extends PartialType(CreateCouponDto) {}
```
`validate-coupon.dto.ts`:
```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { CouponScope } from '../entities/coupon.entity';

export class ValidateCouponDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty({ enum: CouponScope }) @IsEnum(CouponScope) scope: CouponScope;
  @ApiPropertyOptional() @IsOptional() @IsUUID() planId?: string;
}
```
`coupon-response.dto.ts`:
```ts
export class CouponValidationResponseDto {
  valid: true;
  baseAmount: number;
  finalAmount: number;
  discountAmount: number;
}
```
Note: `validate` needs a base amount to preview. The controller resolves it from the plan (subscription) via the subscription price service, or returns discount metadata for orders where base depends on package count. For the pilot (subscription), resolve base = `plan.priceInKopecks`.

- [ ] **Step 2: Add CRUD + preview resolution to CouponService**

```ts
  async create(dto: CreateCouponDto): Promise<Coupon> {
    const coupon = this.couponRepo.create({
      ...dto,
      code: normalizeCode(dto.code),
      description: dto.description ?? null,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      maxRedemptions: dto.maxRedemptions ?? null,
      minAmount: dto.minAmount ?? null,
      subscriptionPlanId: dto.subscriptionPlanId ?? null,
    });
    return this.couponRepo.save(coupon);
  }
  findAll(): Promise<Coupon[]> { return this.couponRepo.find({ order: { createdAt: 'DESC' } }); }
  async findOneById(id: string): Promise<Coupon> {
    const c = await this.couponRepo.findOne({ where: { id } });
    if (!c) throw new CouponNotFoundError();
    return c;
  }
  async update(id: string, dto: UpdateCouponDto): Promise<Coupon> {
    const c = await this.findOneById(id);
    Object.assign(c, {
      ...dto,
      ...(dto.code ? { code: normalizeCode(dto.code) } : {}),
      ...(dto.startsAt !== undefined ? { startsAt: dto.startsAt ? new Date(dto.startsAt) : null } : {}),
      ...(dto.endsAt !== undefined ? { endsAt: dto.endsAt ? new Date(dto.endsAt) : null } : {}),
    });
    return this.couponRepo.save(c);
  }
  async remove(id: string): Promise<void> {
    const count = await this.redemptionRepo.count({ where: { couponId: id } });
    if (count > 0) {
      throw new BadRequestException('Промокод уже использовался — деактивируйте его вместо удаления');
    }
    await this.couponRepo.delete({ id });
  }
```
Import `BadRequestException`, `CreateCouponDto`, `UpdateCouponDto`.

- [ ] **Step 3: Create `coupon.controller.ts`**

```ts
import {
  Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CouponService } from './coupon.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { GetUserMetadata, UserMetadata } from '../shared/decorators/get-user.decorator';
import { Coupon } from './entities/coupon.entity';

@ApiTags('Coupons')
@Controller('coupons')
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  @Post('validate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  async validate(@Body(ValidationPipe) dto: ValidateCouponDto, @GetUserMetadata() user: UserMetadata) {
    return this.couponService.validateForPreview(dto, user.userId);
  }

  @Get()
  @UseGuards(JwtAuthGuard, AdminGuard)
  findAll(): Promise<Coupon[]> { return this.couponService.findAll(); }

  @Get(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  findOne(@Param('id') id: string): Promise<Coupon> { return this.couponService.findOneById(id); }

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  create(@Body(ValidationPipe) dto: CreateCouponDto): Promise<Coupon> { return this.couponService.create(dto); }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  update(@Param('id') id: string, @Body(ValidationPipe) dto: UpdateCouponDto): Promise<Coupon> {
    return this.couponService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async remove(@Param('id') id: string): Promise<{ message: string }> {
    await this.couponService.remove(id);
    return { message: 'Coupon deleted successfully' };
  }
}
```

- [ ] **Step 4: Add `validateForPreview` to the service** (resolves subscription base from the plan)

```ts
  // Injected: SubscriptionPlan repo (add to constructor + module forFeature)
  async validateForPreview(dto: ValidateCouponDto, userId: string): Promise<CouponValidationResponseDto> {
    let baseAmount = 0;
    if (dto.scope === CouponScope.SUBSCRIPTION) {
      if (!dto.planId) throw new BadRequestException('planId обязателен для подписки');
      const plan = await this.planRepo.findOne({ where: { id: dto.planId } });
      if (!plan) throw new BadRequestException('План не найден');
      baseAmount = plan.priceInKopecks;
    } else {
      throw new BadRequestException('Превью для заказов пока не поддерживается');
    }
    const v = await this.validate(dto.code, dto.scope, userId, baseAmount, dto.planId ?? null);
    return { valid: true, baseAmount: v.baseAmount, finalAmount: v.finalAmount, discountAmount: v.discountAmount };
  }
```
Add to constructor: `@InjectRepository(SubscriptionPlan) private readonly planRepo: Repository<SubscriptionPlan>`.

- [ ] **Step 5: Create `coupon.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Coupon } from './entities/coupon.entity';
import { CouponRedemption } from './entities/coupon-redemption.entity';
import { SubscriptionPlan } from '../subscription/entities/subscription-plan.entity';
import { CouponService } from './coupon.service';
import { CouponController } from './coupon.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Coupon, CouponRedemption, SubscriptionPlan])],
  controllers: [CouponController],
  providers: [CouponService],
  exports: [CouponService],
})
export class CouponModule {}
```

- [ ] **Step 6: Import CouponModule in `app.module.ts`** `imports: [...]`.

- [ ] **Step 7: Build + run all coupon tests**

Run: `yarn build && npx jest src/coupon`
Expected: build ok, tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/coupon/dto src/coupon/coupon.controller.ts src/coupon/coupon.module.ts src/coupon/coupon.service.ts src/app.module.ts
git commit -m "feat(coupon): CRUD + validate endpoint + module"
```

---

### Task 7: Order integration

**Files:**
- Modify: `src/order/dto/create-order.dto.ts` (add `couponCode`)
- Modify: `src/order/order.service.ts` (~146-223: reserve + apply)
- Modify: `src/order/services/order-payment.service.ts` (webhook: confirm on paid, release on canceled)
- Modify: `src/order/order.module.ts` (import CouponModule)

- [ ] **Step 1: Add `couponCode` to `CreateOrderDto`**

```ts
  @ApiPropertyOptional({ description: 'Промокод' })
  @IsOptional()
  @IsString()
  couponCode?: string;
```

- [ ] **Step 2: Apply coupon in `order.service.ts` create()**

After base price is computed (currently `getOrderPrice`), when `dto.couponCode` present: compute base as the **standard tiered price without first-order discount**, then `couponService.reserve(code, CouponScope.ORDER, customerId, base, null, { orderId: savedOrder.id })`, set `order.price = reservation.finalAmount`. Because reserve needs the orderId, reserve **after** the order row is created but **before** the payment link, in a flow where a failure releases. Concretely:
  1. Compute `basePrice` (coupon → standard price ignoring first-order; else existing `getOrderPrice`).
  2. Create + save the order with `price: basePrice` (or a placeholder) — keep existing logic.
  3. If couponCode: `const r = await this.couponService.reserve(dto.couponCode, CouponScope.ORDER, customerId, basePrice, null, { orderId: savedOrder.id });` then `savedOrder.price = r.finalAmount; await this.orderRepository.save(savedOrder);`
  4. `createPaymentLink(savedOrder.id, savedOrder.price, customer?.email)` as today.
  5. Wrap 2–4 so a thrown coupon error rolls back / deletes the just-created order (or reserve before create using a generated UUID). *Implementer: prefer generating the order id first (uuid) so reserve+create+payment share one try/catch.*

- [ ] **Step 3: Webhook confirm/release in `order-payment.service.ts`**

In `handleYookassaWebhook` on success (`PAYMENT_PAID`): `await this.couponService.confirmBy({ orderId })`.
On `canceled`/failure: `await this.couponService.releaseBy({ orderId })`.

- [ ] **Step 4: Import CouponModule in `order.module.ts`.**

- [ ] **Step 5: Build**

Run: `yarn build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src/order
git commit -m "feat(coupon): apply coupons to orders + webhook confirm/release"
```

---

### Task 8: Subscription integration

**Files:**
- Modify: `src/subscription/dto/create-subscription-by-plan.dto.ts` (add `couponCode`)
- Modify: `src/subscription/services/payment.service.ts` (~159: reserve + apply)
- Modify: `src/subscription/subscription.service.ts` (~174 createByPlan; and price display methods)
- Modify: `src/subscription/subscription.module.ts` (import CouponModule)

- [ ] **Step 1: Add `couponCode` to `CreateSubscriptionByPlanDto`**

```ts
  @ApiPropertyOptional({ description: 'Промокод' })
  @IsOptional()
  @IsString()
  couponCode?: string;
```
(add `IsOptional, IsString` imports and `ApiPropertyOptional`.)

- [ ] **Step 2: Apply coupon in `payment.service.ts` createPaymentLink()**

Where `finalAmount = subscriptionPlan.priceInKopecks` (~line 159): if `couponCode` present, **skip referral-free**, then `const r = await this.couponService.reserve(couponCode, CouponScope.SUBSCRIPTION, userId, subscriptionPlan.priceInKopecks, subscriptionPlan.id, { subscriptionId })`; `finalAmount = r.finalAmount`. Keep `validateAmountRange(finalAmount)` afterwards. Ensure the subscription id is available for the reservation target (reserve after the pending subscription row exists).

- [ ] **Step 3: Confirm/release on subscription webhook**

In `updatePaymentStatus` on `PAYMENT_PAID`: `await this.couponService.confirmBy({ subscriptionId })`. On failure/cancel: `await this.couponService.releaseBy({ subscriptionId })`.

- [ ] **Step 4: Import CouponModule in `subscription.module.ts`.**

- [ ] **Step 5: Build**

Run: `yarn build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src/subscription
git commit -m "feat(coupon): apply coupons to subscriptions + webhook confirm/release"
```

---

### Task 9: Stale-reservation release cron

**Files:**
- Create: `src/coupon/coupon.cron.ts`
- Modify: `src/coupon/coupon.module.ts` (register provider; ensure `ScheduleModule` available app-wide)

- [ ] **Step 1: Create the cron provider**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CouponService } from './coupon.service';

@Injectable()
export class CouponCron {
  private readonly logger = new Logger(CouponCron.name);
  constructor(private readonly couponService: CouponService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async releaseStale(): Promise<void> {
    const released = await this.couponService.releaseStale(30);
    if (released) this.logger.log(`Released ${released} stale coupon reservations`);
  }
}
```

- [ ] **Step 2: Register `CouponCron` in `coupon.module.ts` providers.** Confirm `ScheduleModule.forRoot()` is imported in `app.module.ts` (it is, since `@nestjs/schedule` is used by scheduled-orders); if not, add it.

- [ ] **Step 3: Build**

Run: `yarn build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/coupon/coupon.cron.ts src/coupon/coupon.module.ts
git commit -m "feat(coupon): cron to release stale reservations"
```

---

### Task 10: Full verification

- [ ] **Step 1: All coupon unit tests pass**

Run: `npx jest src/coupon`
Expected: PASS.

- [ ] **Step 2: Build + lint clean**

Run: `yarn build && yarn lint`
Expected: no errors.

- [ ] **Step 3: Manual smoke (dev, optional)**

`yarn db:up && yarn start:dev`; via Swagger: create a coupon (admin), `POST /coupons/validate` returns discounted price, create a subscription with `couponCode`, simulate the paid webhook, verify `coupon_redemptions.status = confirmed` and `coupons.redeemedCount = 1`.

- [ ] **Step 4: Final commit (if any residual)**

```bash
git commit -am "chore(coupon): verification pass"
```

---

## Follow-up plans (separate)

- **`2026-08-12-coupons-admin.md`** — `mussor-admin` Coupons CRUD section (copy `subscription-plans` module + route + nav) once the backend DTOs are final.
- **`2026-08-12-coupons-web.md`** — `clenHouseWeb` promo-code input on subscription purchase (validate + pass `couponCode`).

## Self-review notes

- Covers spec §4 (entities), §5 (pricing/apply points), §6 (reserve/confirm/release + cron), §7 (admin CRUD + validate), §9 (security: normalization, unique constraint, atomic cap, clamp, idempotent confirm, transactional reserve), §10 (tests), §11 (migrations). §8 (frontends) intentionally deferred to follow-up plans.
- Order preview base depends on package count → `validateForPreview` supports subscription only for now (explicit BadRequest for order); order coupons still apply at purchase time in Task 7.
- Reserve requires the target id (orderId/subscriptionId); Tasks 7–8 note reserving after the pending row exists, inside one try/catch that releases on failure.
