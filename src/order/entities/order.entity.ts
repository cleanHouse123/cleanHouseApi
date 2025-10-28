import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Payment } from './payment.entity';
import { Review } from './review.entity';

export enum OrderStatus {
  NEW = 'new',
  PAID = 'paid',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
  CANCELED = 'canceled',
}

@Entity()
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'customerId' })
  customer: User;

  @Column({ nullable: false })
  customerId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'currierId' })
  currier?: User;

  @Column({ nullable: true })
  currierId?: string;

  @Column({ type: 'text' })
  address: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  price: number;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.NEW,
  })
  status: OrderStatus;

  @Column({ type: 'timestamp', nullable: true })
  scheduledAt?: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'text', nullable: true })
  paymentUrl?: string;

  @Column({ type: 'jsonb', nullable: true })
  coordinates?: { lat: number; lon: number };

  @OneToMany(() => Payment, (payment) => payment.order, {
    cascade: true,
  })
  payments: Payment[];

  @OneToMany(() => Review, (review) => review.order)
  reviews: Review[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
