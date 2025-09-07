import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { PaymentService } from './services/payment.service';
import { PaymentGateway } from './gateways/payment.gateway';
import { Subscription } from './entities/subscription.entity';
import { User } from '../user/entities/user.entity';
import { UserModule } from '../user/user.module';

@Module({
  imports: [TypeOrmModule.forFeature([Subscription, User]), UserModule],
  controllers: [SubscriptionController],
  providers: [SubscriptionService, PaymentService, PaymentGateway],
  exports: [SubscriptionService, PaymentService, PaymentGateway],
})
export class SubscriptionModule {}
