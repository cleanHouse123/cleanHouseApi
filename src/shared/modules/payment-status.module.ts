import { Module } from '@nestjs/common';
import { PaymentStatusController } from '../controllers/payment-status.controller';
import { SubscriptionModule } from '../../subscription/subscription.module';
import { OrderModule } from '../../order/order.module';

@Module({
  imports: [SubscriptionModule, OrderModule],
  controllers: [PaymentStatusController],
})
export class PaymentStatusModule {}
