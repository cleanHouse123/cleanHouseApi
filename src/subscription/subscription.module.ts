import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionController } from './subscription.controller';
import { PaymentPageController } from './controllers/payment-page.controller';
import { SubscriptionPaymentPageController } from './controllers/subscription-payment-page.controller';
import { SubscriptionPlansController } from './controllers/subscription-plans.controller';
import { SubscriptionService } from './subscription.service';
import { PaymentService } from './services/payment.service';
import { AuditService } from './services/audit.service';
import { PriceValidationService } from './services/price-validation.service';
import { SubscriptionPlansService } from './services/subscription-plans.service';
import { PaymentGateway } from './gateways/payment.gateway';
import { SharedConfigService } from '../shared/services/config.service';
import { Subscription } from './entities/subscription.entity';
import { SubscriptionPayment } from './entities/subscription-payment.entity';
import { PaymentAudit } from './entities/payment-audit.entity';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { ReferralFreeSubscriptionUsage } from './entities/referral-free-subscription-usage.entity';
import { User } from '../user/entities/user.entity';
import { Order } from '../order/entities/order.entity';
import { UserModule } from '../user/user.module';
import { SubscriptionLimitsService } from './services/subscription-limits.service';
import { FreeSubscriptionService } from './services/free-subscription.service';
import { AdTokenModule } from '../ad-tokens/ad-token.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Subscription,
      SubscriptionPayment,
      PaymentAudit,
      SubscriptionPlan,
      ReferralFreeSubscriptionUsage,
      User,
      Order,
    ]),
    UserModule,
    AdTokenModule,
  ],
  controllers: [
    SubscriptionController,
    PaymentPageController,
    SubscriptionPaymentPageController,
    SubscriptionPlansController,
  ],
  providers: [
    SubscriptionService,
    PaymentService,
    AuditService,
    PriceValidationService,
    SubscriptionPlansService,
    SubscriptionLimitsService,
    FreeSubscriptionService,
    PaymentGateway,
    SharedConfigService,
  ],
  exports: [
    SubscriptionService,
    PaymentService,
    AuditService,
    SubscriptionPlansService,
    SubscriptionLimitsService,
    PaymentGateway,
  ],
})
export class SubscriptionModule {}
