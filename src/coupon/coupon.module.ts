import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Coupon } from './entities/coupon.entity';
import { CouponRedemption } from './entities/coupon-redemption.entity';
import { SubscriptionPlan } from '../subscription/entities/subscription-plan.entity';
import { CouponService } from './coupon.service';
import { CouponController } from './coupon.controller';
import { CouponCron } from './coupon.cron';
import { PriceModule } from '../price/price.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Coupon, CouponRedemption, SubscriptionPlan]),
    PriceModule,
  ],
  controllers: [CouponController],
  providers: [CouponService, CouponCron],
  exports: [CouponService],
})
export class CouponModule {}
