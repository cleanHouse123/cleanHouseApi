import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ScheduledOrdersController } from './scheduled-orders.controller';
import { ScheduledOrdersService } from './services/scheduled-orders.service';
import { OverdueNotificationService } from './services/overdue-notification.service';
import { ScheduledOrder } from './entities/scheduled-order.entity';
import { Order } from '../order/entities/order.entity';
import { Payment } from '../order/entities/payment.entity';
import { SubscriptionModule } from '../subscription/subscription.module';
import { PriceModule } from '../price/price.module';
import { FcmModule } from '../fcm/fcm.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScheduledOrder, Order, Payment]),
    ScheduleModule.forRoot(),
    SubscriptionModule,
    PriceModule,
    FcmModule,
  ],
  controllers: [ScheduledOrdersController],
  providers: [
    ScheduledOrdersService,
    OverdueNotificationService,
  ],
  exports: [ScheduledOrdersService, OverdueNotificationService],
})
export class ScheduledOrdersModule {}
