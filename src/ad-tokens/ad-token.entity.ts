import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../user/entities/user.entity';

@Entity()
export class AdToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  token: string;

  @Column({ default: 'ad' })
  type: string;

  @Column({ nullable: true })
  reference: string;

  @Column({ default: 0 })
  clickCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => User, (user) => user.adToken)
  users: User[];
}
