import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum CouponScope {
  SUBSCRIPTION = 'subscription',
  ORDER = 'order',
  BOTH = 'both',
}

export enum CouponDiscountType {
  PERCENT = 'percent',
  FIXED_AMOUNT = 'fixed_amount',
  FINAL_PRICE = 'final_price',
}

@Entity('coupons')
export class Coupon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  code: string; // stored normalized: trim + UPPERCASE

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: CouponScope })
  scope: CouponScope;

  @Column({ type: 'enum', enum: CouponDiscountType })
  discountType: CouponDiscountType;

  @Column('integer')
  value: number; // percent 1..100, or kopecks

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  startsAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  endsAt: Date | null;

  @Column({ type: 'integer', nullable: true })
  maxRedemptions: number | null; // null = unlimited

  @Column({ type: 'integer', default: 0 })
  redeemedCount: number;

  @Column({ type: 'integer', nullable: true })
  minAmount: number | null; // kopecks

  @Column({ type: 'uuid', nullable: true })
  subscriptionPlanId: string | null; // restrict subscription coupon to one plan

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
