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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
