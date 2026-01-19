import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('subscription_plans')
export class SubscriptionPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  type: string;

  @Column({ type: 'integer', default: -1 }) // -1 = безлимит
  ordersLimit: number;

  @Column()
  name: string;

  @Column('text')
  description: string;

  @Column('integer')
  priceInKopecks: number;

  @Column()
  duration: string;

  @Column('simple-array')
  features: string[];

  @Column()
  icon: string;

  @Column()
  badgeColor: string;

  @Column({ default: false })
  popular: boolean;

  /**
   * Разрешено ли получать этот план бесплатно по реферальной программе
   */
  @Column({ default: false })
  isReferralFreeEnabled: boolean;

  /**
   * Минимальное количество рефералов для бесплатного получения этого плана
   * Актуально только если isReferralFreeEnabled = true
   */
  @Column({ type: 'integer', default: 0 })
  minReferralsForFree: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
