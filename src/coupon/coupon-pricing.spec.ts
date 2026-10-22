import { computeFinalAmount } from './coupon-pricing';
import {
  Coupon,
  CouponDiscountType,
  CouponScope,
} from './entities/coupon.entity';

const base = (over: Partial<Coupon>): Coupon =>
  ({
    discountType: CouponDiscountType.PERCENT,
    value: 0,
    scope: CouponScope.BOTH,
    ...over,
  }) as Coupon;

describe('computeFinalAmount', () => {
  it('percent: 20% off 20000 = 16000', () => {
    expect(
      computeFinalAmount(
        base({ discountType: CouponDiscountType.PERCENT, value: 20 }),
        20000,
      ),
    ).toBe(16000);
  });

  it('percent: rounds to nearest kopeck', () => {
    expect(
      computeFinalAmount(
        base({ discountType: CouponDiscountType.PERCENT, value: 33 }),
        14900,
      ),
    ).toBe(9983);
  });

  it('fixed_amount: subtracts kopecks', () => {
    expect(
      computeFinalAmount(
        base({ discountType: CouponDiscountType.FIXED_AMOUNT, value: 5000 }),
        20000,
      ),
    ).toBe(15000);
  });

  it('final_price: sets the price', () => {
    expect(
      computeFinalAmount(
        base({ discountType: CouponDiscountType.FINAL_PRICE, value: 100 }),
        20000,
      ),
    ).toBe(100);
  });

  it('clamps to min 100 (1 rub) when computed below', () => {
    expect(
      computeFinalAmount(
        base({ discountType: CouponDiscountType.FINAL_PRICE, value: 0 }),
        20000,
      ),
    ).toBe(100);
    expect(
      computeFinalAmount(
        base({ discountType: CouponDiscountType.PERCENT, value: 100 }),
        20000,
      ),
    ).toBe(100);
  });

  it('clamps to base when computed above base', () => {
    expect(
      computeFinalAmount(
        base({ discountType: CouponDiscountType.FIXED_AMOUNT, value: 999999 }),
        20000,
      ),
    ).toBe(100);
    expect(
      computeFinalAmount(
        base({ discountType: CouponDiscountType.FINAL_PRICE, value: 999999 }),
        20000,
      ),
    ).toBe(20000);
  });
});
