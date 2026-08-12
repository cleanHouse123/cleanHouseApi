import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CouponService } from './coupon.service';

const STALE_RESERVATION_MINUTES = 30;

@Injectable()
export class CouponCron {
  private readonly logger = new Logger(CouponCron.name);

  constructor(private readonly couponService: CouponService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async releaseStale(): Promise<void> {
    const released = await this.couponService.releaseStale(
      STALE_RESERVATION_MINUTES,
    );
    if (released) {
      this.logger.log(`Released ${released} stale coupon reservations`);
    }
  }
}
