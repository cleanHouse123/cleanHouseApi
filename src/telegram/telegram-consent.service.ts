import { Injectable, Logger } from '@nestjs/common';
import { UserService } from '../user/user.service';

export interface TelegramConsentState {
  /** Приняты оферта, пользовательское соглашение и согласие на обработку ПДн */
  terms: boolean;
  /** Согласие на рекламную рассылку */
  marketing: boolean;
  acceptedAt: Date;
}

/**
 * Согласия, которые пользователь даёт в боте ДО передачи номера телефона.
 * Пока аккаунт не связан с Telegram, согласие хранится в памяти процесса,
 * после привязки номера переносится в карточку пользователя.
 */
@Injectable()
export class TelegramConsentService {
  private readonly logger = new Logger(TelegramConsentService.name);
  private readonly pending = new Map<string, TelegramConsentState>();

  constructor(private readonly userService: UserService) {}

  has(telegramId: string): boolean {
    return this.pending.get(telegramId)?.terms === true;
  }

  get(telegramId: string): TelegramConsentState | undefined {
    return this.pending.get(telegramId);
  }

  async accept(telegramId: string, revision: string): Promise<void> {
    const current = this.pending.get(telegramId);
    this.pending.set(telegramId, {
      terms: true,
      marketing: current?.marketing ?? false,
      acceptedAt: new Date(),
    });
    await this.persist(telegramId, revision);
  }

  async acceptMarketing(telegramId: string, revision: string): Promise<void> {
    const current = this.pending.get(telegramId);
    this.pending.set(telegramId, {
      terms: current?.terms ?? false,
      marketing: true,
      acceptedAt: current?.acceptedAt ?? new Date(),
    });
    await this.persist(telegramId, revision);
  }

  /**
   * Переносит согласия в карточку пользователя. Вызывается после привязки
   * номера телефона, когда аккаунт точно существует.
   */
  async persist(telegramId: string, revision: string): Promise<void> {
    const state = this.pending.get(telegramId);
    if (!state) {
      return;
    }

    try {
      const user = await this.userService.findByTelegramId(telegramId);
      if (!user) {
        // Аккаунт ещё не связан — согласие останется в памяти до привязки
        return;
      }

      await this.userService.saveConsents(user.id, {
        terms: state.terms,
        personalData: state.terms,
        // согласие на рекламу, данное ранее на сайте, бот не отзывает
        marketing: state.marketing || Boolean(user.marketingConsentAt),
        revision,
      });
    } catch (error) {
      this.logger.error(
        `Не удалось сохранить согласия для telegramId=${telegramId}`,
        error as Error,
      );
    }
  }
}
