import { Expose } from 'class-transformer';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';

export class SubscriptionPlanResponseDto {
  @Expose()
  id: string;

  @Expose()
  type: string;

  @Expose()
  name: string;

  @Expose()
  description: string;

  @Expose()
  priceInKopecks: number;

  @Expose()
  priceInRubles: number;

  @Expose()
  duration: string;

  @Expose()
  features: string[];

  @Expose()
  icon: string;

  @Expose()
  badgeColor: string;

  @Expose()
  popular: boolean;

  @Expose()
  ordersLimit: number;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;

  constructor(subscriptionPlan: SubscriptionPlan) {
    this.id = subscriptionPlan.id;
    this.type = subscriptionPlan.type;
    this.name = subscriptionPlan.name;
    this.description = subscriptionPlan.description;
    this.priceInKopecks = subscriptionPlan.priceInKopecks;
    this.priceInRubles = subscriptionPlan.priceInKopecks / 100; // Конвертируем копейки в рубли
    this.duration = subscriptionPlan.duration;
    this.features = subscriptionPlan.features;
    this.icon = subscriptionPlan.icon;
    this.badgeColor = subscriptionPlan.badgeColor;
    this.popular = subscriptionPlan.popular;
    this.ordersLimit = subscriptionPlan.ordersLimit;
    this.createdAt = subscriptionPlan.createdAt;
    this.updatedAt = subscriptionPlan.updatedAt;
  }
}
