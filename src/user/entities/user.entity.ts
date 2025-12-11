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

  @ManyToOne(() => AdToken, (adToken) => adToken.users, { nullable: true })
  adToken: AdToken;

  @OneToMany(() => UserAddress, (address) => address.user)
  addresses: UserAddress[];
}
