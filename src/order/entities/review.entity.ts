import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { User } from '../../user/entities/user.entity';

@Entity()
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Order, (order) => order.reviews, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({ nullable: false })
  orderId: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'clientId' })
  client: User;

  @Column({ nullable: false })
  clientId: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'currierId' })
  currier: User;

  @Column({ nullable: false })
  currierId: string;

  @Column({ type: 'int' })
  rating: number;

  @Column({ type: 'text', nullable: true })
  comment?: string;

  @CreateDateColumn()
  createdAt: Date;
}
