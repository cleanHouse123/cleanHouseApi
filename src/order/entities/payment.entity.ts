import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Order } from './order.entity';

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

/** Решение по возврату денег при отмене оплаченного заказа */
export enum RefundStatus {
  /** Решено не возвращать: вина заказчика, пункт 5.7 Оферты */
  NONE = 'none',
  /** Возврат создан в YooKassa, ждём подтверждения */
  PENDING = 'pending',
  SUCCEEDED = 'succeeded',
  CANCELED = 'canceled',
}

export enum PaymentMethod {
  CASH = 'cash',
  CARD = 'card',
  ONLINE = 'online',
  SUBSCRIPTION = 'subscription',
}

@Entity()
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Order, (order) => order.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({ nullable: false })
  orderId: string;

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

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column({
    type: 'enum',
    enum: PaymentMethod,
  })
  method: PaymentMethod;

  @Column({ nullable: true })
  yookassaId?: string;

  /**
   * Подписка, из которой списан вынос, — только у платежей по подписке.
   *
   * Без этой ссылки отмена заказа возвращала вынос в ту подписку, которая
   * активна на момент отмены: отменив старый заказ, клиент получал
   * бесплатный вынос по новой подписке.
   */
  @Column({ type: 'uuid', nullable: true })
  subscriptionId?: string | null;

  @Column({ type: 'enum', enum: RefundStatus, nullable: true })
  refundStatus?: RefundStatus | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: {
      to: (value?: number | null) => value ?? null,
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

  @CreateDateColumn()
  createdAt: Date;
}
