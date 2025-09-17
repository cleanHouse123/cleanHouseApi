import { SubscriptionPlan } from '../entities/subscription-plan.entity';

export class SubscriptionPlanResponseDto {
  id: string;
  type: string;
  name: string;
  description: string;
  priceInKopecks: number;
  duration: string;
  features: string[];
  icon: string;
  badgeColor: string;
  popular: boolean;
  createdAt: Date;
  updatedAt: Date;

  constructor(subscriptionPlan: SubscriptionPlan) {
    this.id = subscriptionPlan.id;
    this.type = subscriptionPlan.type;
    this.name = subscriptionPlan.name;
    this.description = subscriptionPlan.description;
    this.priceInKopecks = subscriptionPlan.priceInKopecks;
    this.duration = subscriptionPlan.duration;
    this.features = subscriptionPlan.features;
    this.icon = subscriptionPlan.icon;
    this.badgeColor = subscriptionPlan.badgeColor;
    this.popular = subscriptionPlan.popular;
    this.createdAt = subscriptionPlan.createdAt;
    this.updatedAt = subscriptionPlan.updatedAt;
  }
}
