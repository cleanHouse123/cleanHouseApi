import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

export enum ScheduleFrequency {
  DAILY = 'daily',
  EVERY_OTHER_DAY = 'every_other_day',
  WEEKLY = 'weekly',
  CUSTOM = 'custom',
}

@Entity('scheduled_orders')
export class ScheduledOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'customerId' })
  customer: User;

  @Column({ nullable: false })
  customerId: string;

  @Column({ type: 'text' })
  address: string;

  @Column({ type: 'jsonb', nullable: true })
  addressDetails?: {
    building?: number;
    buildingBlock?: string;
    entrance?: string;
    floor?: number;
    apartment?: number;
    domophone?: string;
  };

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({
    type: 'enum',
    enum: ScheduleFrequency,
    default: ScheduleFrequency.DAILY,
  })
  frequency: ScheduleFrequency;

  @Column({ type: 'varchar', length: 5, nullable: true })
  preferredTime?: string; // формат "HH:mm" в UTC

  @Column({ type: 'simple-array', nullable: true })
  daysOfWeek?: number[];

  @Column({ type: 'timestamp' })
  startDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  endDate?: Date;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastCreatedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
