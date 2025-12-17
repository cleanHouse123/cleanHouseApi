import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { SubscriptionPlan } from './subscription-plan.entity';

/**
 * Фиксирует использование бесплатной подписки по реферальной программе
 * для конкретного пользователя и конкретного плана подписки.
 * Уникальность (userId, subscriptionPlanId) гарантирует,
 * что один и тот же план нельзя получить бесплатно более одного раза.
 */
@Entity('referral_free_subscription_usage')
@Index(['userId', 'subscriptionPlanId'], { unique: true })
export class ReferralFreeSubscriptionUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  subscriptionPlanId: string;

  @ManyToOne(() => SubscriptionPlan, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subscriptionPlanId' })
  subscriptionPlan: SubscriptionPlan;

  @CreateDateColumn()
  createdAt: Date;
}

