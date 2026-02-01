import { UserRole } from 'src/shared/types/user.role';
import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { AdToken } from '../../ad-tokens/ad-token.entity';
import { UsageFeaturesEnum } from 'src/shared/types/user-feutures';
import { UserAddress } from '../../address/entities/user-address';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    array: true,
    default: [],
  })
  roles: UserRole[];

  @Column()
  name: string;

  @Column({ unique: true, nullable: true })
  phone?: string;

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

  @Column({ nullable: true })
  deviceToken?: string;

  @Column({ unique: true, nullable: true })
  telegramId?: string;

  @Column({ nullable: true })
  telegramUsername?: string;

  @Column({
    type: 'enum',
    enum: UsageFeaturesEnum,
    array: true,
    default: [],
  })
  usageFeatures: UsageFeaturesEnum[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  deletedAt?: Date;

  @ManyToOne(() => AdToken, (adToken) => adToken.users, { nullable: true })
  adToken: AdToken;

  @OneToMany(() => UserAddress, (address) => address.user)
  addresses: UserAddress[];
}
