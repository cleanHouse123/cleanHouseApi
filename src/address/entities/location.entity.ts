import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('location')
export class Location {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', nullable: true })
  region: string | null;

  @Column({ type: 'text', nullable: true })
  area: string | null;

  @Column({ type: 'text', nullable: true })
  city: string | null;

  @Column({ type: 'text', nullable: true })
  settlement: string | null;

  @Column({ type: 'text', nullable: true })
  street: string | null;

  /** Адм. район города (при division=administrative), для фильтра locations в DaData */
  @Column({ type: 'text', nullable: true })
  city_district: string | null;

  /** Муниципальное поселение / внутригородской округ (при division=municipal), например «Ланское» */
  @Column({ type: 'text', nullable: true })
  sub_area: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
