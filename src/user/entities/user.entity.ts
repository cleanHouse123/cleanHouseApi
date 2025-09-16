import { UserRole } from 'src/shared/types/user.role';
import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    nullable: true,
  })
  role: UserRole;

  @Column()
  name: string;

  @Column({ unique: true })
  phone: string;

  @Column({ default: false })
  isPhoneVerified: boolean;

  @Column({ unique: true, nullable: true })
  email?: string;

  @Column({ default: false })
  isEmailVerified: boolean;

  @Column({ nullable: true })
  hash_password: string;

  @Column({ nullable: true })
  refreshTokenHash?: string;

  @Column({ nullable: true })
  lastLoginAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
