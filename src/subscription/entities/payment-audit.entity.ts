import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum PaymentAuditAction {
  PAYMENT_CREATED = 'payment_created',
  PAYMENT_PAID = 'payment_paid',
  PAYMENT_FAILED = 'payment_failed',
  PAYMENT_REFUNDED = 'payment_refunded',
  SUBSCRIPTION_ACTIVATED = 'subscription_activated',
  SUBSCRIPTION_CANCELLED = 'subscription_cancelled',
}

@Entity('payment_audit')
@Index(['paymentId'])
@Index(['userId'])
@Index(['createdAt'])
export class PaymentAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  paymentId?: string;

  @Column({ nullable: false })
  userId: string;

  @Column({ nullable: true })
  subscriptionId?: string;

  @Column({
    type: 'enum',
    enum: PaymentAuditAction,
  })
  action: PaymentAuditAction;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  amount?: number;

  @Column({ type: 'json', nullable: true })
  metadata?: any;

  @Column({ nullable: true })
  ipAddress?: string;

  @Column({ nullable: true })
  userAgent?: string;

  @CreateDateColumn()
  createdAt: Date;
}
