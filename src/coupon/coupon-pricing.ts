import { Coupon, CouponDiscountType } from './entities/coupon.entity';

export const COUPON_MIN_AMOUNT = 100; // 1 rub in kopecks

/**
 * Compute the final charged amount (kopecks) after applying a coupon to a base
 * amount. Always clamped to [COUPON_MIN_AMOUNT, baseAmount]: a coupon never
 * charges less than 1 rub and never more than the base price.
 */
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
