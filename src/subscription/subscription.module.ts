import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionController } from './subscription.controller';
import { PaymentPageController } from './controllers/payment-page.controller';
import { SubscriptionService } from './subscription.service';
import { PaymentService } from './services/payment.service';
import { AuditService } from './services/audit.service';
import { PriceValidationService } from './services/price-validation.service';
import { PaymentGateway } from './gateways/payment.gateway';
import { SharedConfigService } from '../shared/services/config.service';
import { Subscription } from './entities/subscription.entity';
import { SubscriptionPayment } from './entities/subscription-payment.entity';
import { PaymentAudit } from './entities/payment-audit.entity';
import { User } from '../user/entities/user.entity';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Subscription,
      SubscriptionPayment,
      PaymentAudit,
      User,
    ]),
    UserModule,
  ],
  controllers: [SubscriptionController, PaymentPageController],
  providers: [
    SubscriptionService,
    PaymentService,
    AuditService,
    PriceValidationService,
    PaymentGateway,
    SharedConfigService,
  ],
  exports: [SubscriptionService, PaymentService, AuditService, PaymentGateway],
})
export class SubscriptionModule {}
