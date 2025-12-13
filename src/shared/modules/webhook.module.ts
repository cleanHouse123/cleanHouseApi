import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookController } from '../controllers/webhook.controller';
import { OrderModule } from '../../order/order.module';
import { SubscriptionModule } from '../../subscription/subscription.module';
import { FcmModule } from '../../fcm/fcm.module';
import { Order } from '../../order/entities/order.entity';
import { User } from '../../user/entities/user.entity';

@Module({
  imports: [
    OrderModule,
    SubscriptionModule,
    FcmModule,
    TypeOrmModule.forFeature([Order, User]),
  ],
  controllers: [WebhookController],
})
export class WebhookModule {}
