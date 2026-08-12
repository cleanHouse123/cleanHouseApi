import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum CouponRedemptionStatus {
  RESERVED = 'reserved',
  CONFIRMED = 'confirmed',
}

@Entity('coupon_redemptions')
@Index(['couponId', 'userId'], { unique: true })
export class CouponRedemption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  couponId: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: CouponRedemptionStatus })
  status: CouponRedemptionStatus;

  @Column({ type: 'uuid', nullable: true })
  orderId: string | null;

  @Column({ type: 'uuid', nullable: true })
  subscriptionId: string | null;

  @Column('integer')
  amountBefore: number;

  @Column('integer')
  amountAfter: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
