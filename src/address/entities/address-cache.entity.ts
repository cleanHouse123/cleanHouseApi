import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('address_cache')
@Index(['query', 'city_or_settlement'], { unique: true })
export class AddressCache {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 500 })
  query: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city_or_settlement: string | null;

  @Column({ type: 'jsonb' })
  cached_results: any[];

  @Column({ type: 'int', default: 1 })
  search_count: number;

  @Column({ type: 'timestamp', nullable: true })
  last_searched_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
