import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ScheduledOrdersController } from './scheduled-orders.controller';
import { ScheduledOrdersService } from './services/scheduled-orders.service';
import { OverdueNotificationService } from './services/overdue-notification.service';
import { ScheduledOrder } from './entities/scheduled-order.entity';
import { Order } from '../order/entities/order.entity';
import { UserAddress } from '../address/entities/user-address';
import { OrderModule } from '../order/order.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { FcmModule } from '../fcm/fcm.module';

@Module({
  imports: [
    // Order нужен крону просрочки, заказы по расписанию создаёт OrderService
    TypeOrmModule.forFeature([ScheduledOrder, Order, UserAddress]),
    ScheduleModule.forRoot(),
    SubscriptionModule,
    OrderModule,
    FcmModule,
  ],
  controllers: [ScheduledOrdersController],
  providers: [ScheduledOrdersService, OverdueNotificationService],
  exports: [ScheduledOrdersService, OverdueNotificationService],
})
export class ScheduledOrdersModule {}
