import { Module } from '@nestjs/common';
import { RefundService } from './refund.service';

/**
 * Возвраты нужны и заказам, и подпискам. Отдельный модуль, потому что
 * OrderModule уже импортирует SubscriptionModule: импорт в обратную
 * сторону замкнул бы цикл.
 */
@Module({
  providers: [RefundService],
  exports: [RefundService],
})
export class RefundModule {}
