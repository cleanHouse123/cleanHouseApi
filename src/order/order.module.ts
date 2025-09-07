import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { OrderPaymentPageController } from './controllers/order-payment-page.controller';
import { OrderPaymentService } from './services/order-payment.service';
import { OrderPaymentGateway } from './gateways/order-payment.gateway';
import { Order } from './entities/order.entity';
import { Payment } from './entities/payment.entity';
import { Review } from './entities/review.entity';
import { User } from '../user/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Order, Payment, Review, User])],
  controllers: [OrderController, OrderPaymentPageController],
  providers: [OrderService, OrderPaymentService, OrderPaymentGateway],
  exports: [OrderService, OrderPaymentService, OrderPaymentGateway],
})
export class OrderModule {}
