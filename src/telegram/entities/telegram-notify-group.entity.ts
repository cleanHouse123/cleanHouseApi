import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity()
export class TelegramNotifyGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** ID чата в Telegram (для групп обычно вида -1001234567890) */
  @Column({ type: 'varchar', length: 32 })
  @Index({ unique: true })
  chatId: string;

  /** Название группы (опционально, для удобства в админке) */
  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  /** Группа активна — бот в чате и рассылка включена */
  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
