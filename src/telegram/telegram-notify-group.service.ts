import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelegramNotifyGroup } from './entities/telegram-notify-group.entity';

@Injectable()
export class TelegramNotifyGroupService {
  private readonly logger = new Logger(TelegramNotifyGroupService.name);

  constructor(
    @InjectRepository(TelegramNotifyGroup)
    private readonly repository: Repository<TelegramNotifyGroup>,
  ) {}

  /** Возвращает chat_id всех активных групп для рассылки о новых заказах */
  async getActiveChatIds(): Promise<string[]> {
    const groups = await this.repository.find({
      where: { isActive: true },
      select: ['chatId'],
    });
    return groups.map((g) => g.chatId.trim()).filter(Boolean);
  }

  /** Добавить или активировать группу по chat_id */
  async addGroup(chatId: string, title?: string): Promise<TelegramNotifyGroup> {
    const id = String(chatId).trim();
    const existing = await this.repository.findOne({ where: { chatId: id } });
    if (existing) {
      existing.isActive = true;
      if (title != null) existing.title = title;
      await this.repository.save(existing);
      this.logger.log(`[addGroup] Группа уже была в списке, активирована: ${id}`);
      return existing;
    }
    const group = this.repository.create({
      chatId: id,
      title: title ?? null,
      isActive: true,
    });
    await this.repository.save(group);
    this.logger.log(`[addGroup] Добавлена группа для рассылки заказов: ${id}`);
    return group;
  }

  /** Деактивировать группу (бот вышел или удалён) */
  async deactivateGroup(chatId: string): Promise<void> {
    const id = String(chatId).trim();
    await this.repository.update({ chatId: id }, { isActive: false });
    this.logger.log(`[deactivateGroup] Рассылка отключена для группы: ${id}`);
  }
}
