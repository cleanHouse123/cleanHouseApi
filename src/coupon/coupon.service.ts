import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError, Repository } from 'typeorm';
import { Coupon, CouponScope } from './entities/coupon.entity';
import {
  CouponRedemption,
  CouponRedemptionStatus,
} from './entities/coupon-redemption.entity';
import { SubscriptionPlan } from '../subscription/entities/subscription-plan.entity';
import { computeFinalAmount } from './coupon-pricing';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';
import { CouponValidationResponseDto } from './dto/coupon-response.dto';
import {
  CouponNotFoundError,
  CouponInactiveError,
  CouponExpiredError,
  CouponScopeMismatchError,
  CouponPlanMismatchError,
  CouponMinAmountError,
  CouponAlreadyUsedError,
  CouponLimitReachedError,
} from './coupon.errors';

export interface CouponValidation {
  coupon: Coupon;
  baseAmount: number;
  finalAmount: number;
  discountAmount: number;
}

export type RedemptionTarget = { orderId?: string; subscriptionId?: string };

export const normalizeCode = (code: string): string =>
  code.trim().toUpperCase();

@Injectable()
export class CouponService {
  constructor(
    @InjectRepository(Coupon)
    private readonly couponRepo: Repository<Coupon>,
    @InjectRepository(CouponRedemption)
    private readonly redemptionRepo: Repository<CouponRedemption>,
    @InjectRepository(SubscriptionPlan)
    private readonly planRepo: Repository<SubscriptionPlan>,
    private readonly dataSource: DataSource,
  ) {}

  private scopeMatches(coupon: Coupon, scope: CouponScope): boolean {
    return coupon.scope === CouponScope.BOTH || coupon.scope === scope;
  }

  /** Throws a typed error if the coupon cannot be used for this context. */
  private assertUsable(
    coupon: Coupon | null,
    scope: CouponScope,
    baseAmount: number,
    planId: string | null,
  ): Coupon {
    if (!coupon) throw new CouponNotFoundError();
    if (!coupon.isActive) throw new CouponInactiveError();
    const now = Date.now();
    if (coupon.startsAt && coupon.startsAt.getTime() > now) {
      throw new CouponExpiredError();
    }
    if (coupon.endsAt && coupon.endsAt.getTime() < now) {
      throw new CouponExpiredError();
    }
    if (!this.scopeMatches(coupon, scope)) {
      throw new CouponScopeMismatchError();
    }
    if (
      scope === CouponScope.SUBSCRIPTION &&
      coupon.subscriptionPlanId &&
      coupon.subscriptionPlanId !== planId
    ) {
      throw new CouponPlanMismatchError();
    }
    if (coupon.minAmount != null && baseAmount < coupon.minAmount) {
      throw new CouponMinAmountError();
    }
    if (
      coupon.maxRedemptions != null &&
      coupon.redeemedCount >= coupon.maxRedemptions
    ) {
      throw new CouponLimitReachedError();
    }
    return coupon;
  }

  /** Preview validation (no reservation). Used by the /coupons/validate endpoint. */
  async validate(
    code: string,
    scope: CouponScope,
    userId: string,
    baseAmount: number,
    planId: string | null,
  ): Promise<CouponValidation> {
    const coupon = await this.couponRepo.findOne({
      where: { code: normalizeCode(code) },
    });
    this.assertUsable(coupon, scope, baseAmount, planId);
    const existing = await this.redemptionRepo.findOne({
      where: { couponId: coupon!.id, userId },
    });
    if (existing) throw new CouponAlreadyUsedError();
    const finalAmount = computeFinalAmount(coupon!, baseAmount);
    return {
      coupon: coupon!,
      baseAmount,
      finalAmount,
      discountAmount: baseAmount - finalAmount,
    };
  }

  /**
   * Reserve a redemption on an existing transaction manager. Use this from a
   * caller that already owns a transaction (order/subscription payment flow) so
   * the reservation commits or rolls back atomically together with the purchase.
   * Increments the global cap conditionally (no oversell) and inserts a RESERVED
   * row (unique (couponId,userId) blocks reuse, also enforced at the DB level).
   */
  async reserveWith(
    m: EntityManager,
    code: string,
    scope: CouponScope,
    userId: string,
    baseAmount: number,
    planId: string | null,
    target: RedemptionTarget,
  ): Promise<CouponValidation & { redemptionId: string }> {
    const coupon = await m.findOne(Coupon, {
      where: { code: normalizeCode(code) },
    });
    this.assertUsable(coupon, scope, baseAmount, planId);

    const existing = await m.findOne(CouponRedemption, {
      where: { couponId: coupon!.id, userId },
    });
    if (existing) throw new CouponAlreadyUsedError();

    // Atomic global-cap capture.
    const upd = await m
      .createQueryBuilder()
      .update(Coupon)
      .set({ redeemedCount: () => 'redeemedCount + 1' })
      .where('id = :id', { id: coupon!.id })
      .andWhere('(maxRedemptions IS NULL OR redeemedCount < maxRedemptions)')
      .execute();
    if (!upd.affected) throw new CouponLimitReachedError();

    const finalAmount = computeFinalAmount(coupon!, baseAmount);
    let redemption: CouponRedemption;
    try {
      redemption = await m.save(
        CouponRedemption,
        m.create(CouponRedemption, {
          couponId: coupon!.id,
          userId,
          status: CouponRedemptionStatus.RESERVED,
          orderId: target.orderId ?? null,
          subscriptionId: target.subscriptionId ?? null,
          amountBefore: baseAmount,
          amountAfter: finalAmount,
        }),
      );
    } catch (e) {
      // Unique (couponId,userId) violation under a concurrent reserve.
      if (e instanceof QueryFailedError && (e as any).code === '23505') {
        throw new CouponAlreadyUsedError();
      }
      throw e;
    }

    return {
      coupon: coupon!,
      baseAmount,
      finalAmount,
      discountAmount: baseAmount - finalAmount,
      redemptionId: redemption.id,
    };
  }

  /**
   * Standalone reserve that owns its transaction. Use when the caller is not
   * already inside a transaction.
   */
  async reserve(
    code: string,
    scope: CouponScope,
    userId: string,
    baseAmount: number,
    planId: string | null,
    target: RedemptionTarget,
  ): Promise<CouponValidation & { redemptionId: string }> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const res = await this.reserveWith(
        qr.manager,
        code,
        scope,
        userId,
        baseAmount,
        planId,
        target,
      );
      await qr.commitTransaction();
      return res;
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  /** Idempotent: confirm a reserved redemption on an existing transaction manager. */
  async confirmWith(m: EntityManager, where: RedemptionTarget): Promise<void> {
    await m.update(
      CouponRedemption,
      { ...where, status: CouponRedemptionStatus.RESERVED },
      { status: CouponRedemptionStatus.CONFIRMED },
    );
  }

  /** Idempotent: confirm a reserved redemption on successful payment. */
  async confirmBy(where: RedemptionTarget): Promise<void> {
    await this.confirmWith(this.dataSource.manager, where);
  }

  /** Release a reserved redemption on an existing transaction manager. */
  async releaseWith(m: EntityManager, where: RedemptionTarget): Promise<void> {
    const row = await m.findOne(CouponRedemption, {
      where: { ...where, status: CouponRedemptionStatus.RESERVED },
    });
    if (row) {
      await m.delete(CouponRedemption, { id: row.id });
      await m.decrement(Coupon, { id: row.couponId }, 'redeemedCount', 1);
    }
  }

  /** Release a reserved redemption (payment failed/canceled/expired). */
  async releaseBy(where: RedemptionTarget): Promise<void> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await this.releaseWith(qr.manager, where);
      await qr.commitTransaction();
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  /** Release reservations older than N minutes with no successful payment. */
  async releaseStale(olderThanMinutes: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
    const stale = await this.redemptionRepo.find({
      where: { status: CouponRedemptionStatus.RESERVED },
    });
    let released = 0;
    for (const row of stale) {
      if (row.createdAt < cutoff) {
        await this.releaseBy(
          row.orderId
            ? { orderId: row.orderId }
            : { subscriptionId: row.subscriptionId! },
        );
        released++;
      }
    }
    return released;
  }

  // ----- Admin CRUD -----

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

  findAll(): Promise<Coupon[]> {
    return this.couponRepo.find({ order: { createdAt: 'DESC' } });
  }

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
      ...(dto.startsAt !== undefined
        ? { startsAt: dto.startsAt ? new Date(dto.startsAt) : null }
        : {}),
      ...(dto.endsAt !== undefined
        ? { endsAt: dto.endsAt ? new Date(dto.endsAt) : null }
        : {}),
    });
    return this.couponRepo.save(c);
  }

  async remove(id: string): Promise<void> {
    const count = await this.redemptionRepo.count({ where: { couponId: id } });
    if (count > 0) {
      throw new BadRequestException(
        'Промокод уже использовался — деактивируйте его вместо удаления',
      );
    }
    await this.couponRepo.delete({ id });
  }

  /** Resolve base amount from the plan and validate (preview) for the client. */
  async validateForPreview(
    dto: ValidateCouponDto,
    userId: string,
  ): Promise<CouponValidationResponseDto> {
    let baseAmount = 0;
    if (dto.scope === CouponScope.SUBSCRIPTION) {
      if (!dto.planId) {
        throw new BadRequestException('planId обязателен для подписки');
      }
      const plan = await this.planRepo.findOne({ where: { id: dto.planId } });
      if (!plan) throw new BadRequestException('План не найден');
      baseAmount = plan.priceInKopecks;
    } else {
      throw new BadRequestException('Превью для заказов пока не поддерживается');
    }
    const v = await this.validate(
      dto.code,
      dto.scope,
      userId,
      baseAmount,
      dto.planId ?? null,
    );
    return {
      valid: true,
      baseAmount: v.baseAmount,
      finalAmount: v.finalAmount,
      discountAmount: v.discountAmount,
    };
  }
}
