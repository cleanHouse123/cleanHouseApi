import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RefundStatus } from '../../order/entities/payment.entity';

export enum SubscriptionPaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCESS = 'success',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

@Entity('subscription_payments')
export class SubscriptionPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false })
  subscriptionId: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  amount: number;

  @Column({ nullable: true })
  subscriptionType?: string;

  @Column({
    type: 'enum',
    enum: SubscriptionPaymentStatus,
    default: SubscriptionPaymentStatus.PENDING,
  })
  status: SubscriptionPaymentStatus;

  @Column({ nullable: true })
  paymentUrl?: string;

  @Column({ nullable: true })
  yookassaId?: string;

  @Column({ type: 'enum', enum: RefundStatus, nullable: true })
  refundStatus?: RefundStatus | null;

  /** Возвращённая сумма в копейках, как и amount */
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: {
      to: (value?: number | null) => value,
      from: (value?: string | null) =>
        value == null ? null : parseFloat(value),
    },
  })
  refundAmount?: number | null;

  @Column({ nullable: true })
  refundId?: string;

  /** Причина решения: обязательна, когда возврат не делается */
  @Column({ nullable: true })
  refundReason?: string;

  @Column({ type: 'timestamp', nullable: true })
  refundDecidedAt?: Date | null;

  @Column({ type: 'uuid', nullable: true })
  refundDecidedBy?: string | null;

  @Column({ nullable: true })
  paidAt?: Date;

  @Column({ nullable: true })
  refundedAt?: Date;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
