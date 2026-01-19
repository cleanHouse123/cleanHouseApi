import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { DaDataAddressDataNormalized } from '../interfaces/address-data.interface';
import { User } from '../../user/entities/user.entity';
import { AddressUsageFeature } from '../../shared/types/address-features';

@Entity('user-address')
export class UserAddress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, (user) => user.addresses, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'jsonb', nullable: true })
  address: DaDataAddressDataNormalized | null;

  @Column({ type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ type: 'boolean', default: false })
  isSupportableArea: boolean;

  @Column({ type: 'jsonb', nullable: true })
  addressDetails: {
    building?: number;
    buildingBlock?: string;
    entrance?: string;
    floor?: number;
    apartment?: number;
    domophone?: string;
  } | null;

  @Column({
    type: 'enum',
    enum: AddressUsageFeature,
    enumName: 'address_usage_feature_enum',
    array: true,
    default: [],
  })
  usageFeatures: AddressUsageFeature[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
