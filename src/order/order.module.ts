import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { OrderPaymentPageController } from './controllers/order-payment-page.controller';
import { OrderPaymentService } from './services/order-payment.service';
import { OrderPaymentGateway } from './gateways/order-payment.gateway';
import { SharedConfigService } from '../shared/services/config.service';
import { SubscriptionModule } from '../subscription/subscription.module';
import { PriceModule } from '../price/price.module';
import { Order } from './entities/order.entity';
import { Payment } from './entities/payment.entity';
import { Review } from './entities/review.entity';
import { User } from '../user/entities/user.entity';
import { UserAddress } from '../address/entities/user-address';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Payment, Review, User, UserAddress]),
    SubscriptionModule,
    PriceModule,
  ],
  controllers: [OrderController, OrderPaymentPageController],
  providers: [
    OrderService,
    OrderPaymentService,
    OrderPaymentGateway,
    SharedConfigService,
  ],
  exports: [OrderService, OrderPaymentService, OrderPaymentGateway],
})
export class OrderModule {}
