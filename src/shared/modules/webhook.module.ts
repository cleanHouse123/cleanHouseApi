import { Module } from '@nestjs/common';
import { WebhookController } from '../controllers/webhook.controller';
import { OrderModule } from '../../order/order.module';
import { SubscriptionModule } from '../../subscription/subscription.module';

@Module({
  imports: [OrderModule, SubscriptionModule],
  controllers: [WebhookController],
})
export class WebhookModule {}
