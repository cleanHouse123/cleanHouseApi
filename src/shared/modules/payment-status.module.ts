import { Module } from '@nestjs/common';
import { PaymentStatusController } from '../controllers/payment-status.controller';
import { PaymentService } from '../../subscription/services/payment.service';
import { OrderPaymentService } from '../../order/services/order-payment.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from '../../order/entities/payment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Payment])],
  controllers: [PaymentStatusController],
  providers: [PaymentService, OrderPaymentService],
})
export class PaymentStatusModule {}
