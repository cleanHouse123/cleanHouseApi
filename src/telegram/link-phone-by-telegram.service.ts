import { Injectable, Logger } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { normalizePhoneToE164 } from '../shared/utils/phone-normalizer.util';

export type LinkPhoneResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'not_found' | 'conflict' | 'invalid_phone' | 'error';
    };

@Injectable()
export class LinkPhoneByTelegramService {
  private readonly logger = new Logger(LinkPhoneByTelegramService.name);

  constructor(private readonly userService: UserService) {}

  /**
   * Привязывает Telegram к аккаунту по контакту.
   * 1) Если найден пользователь по telegramId — обновляем ему телефон.
   * 2) Если не найден по telegramId, но найден по номеру телефона — сохраняем ему telegramId
   *    (нужно для курьеров, созданных админом: они могут привязать Telegram через бота).
   */
  async link(
    telegramId: string,
    rawPhoneNumber: string,
    telegramUsername?: string,
  ): Promise<LinkPhoneResult> {
    let normalizedPhone: string;
    try {
      normalizedPhone = normalizePhoneToE164(rawPhoneNumber);
    } catch {
      this.logger.warn(
        `[link] Invalid phone from telegramId=${telegramId}: ${rawPhoneNumber}`,
      );
      return { ok: false, reason: 'invalid_phone' };
    }

    const userByTelegram = await this.userService.findByTelegramId(telegramId);
    if (userByTelegram) {
      const existingByPhone =
        await this.userService.findByPhone(normalizedPhone);
      if (existingByPhone && existingByPhone.id !== userByTelegram.id) {
        this.logger.warn(
          `[link] Phone conflict: ${normalizedPhone} already linked to another userId`,
        );
        return { ok: false, reason: 'conflict' };
      }
      try {
        await this.userService.update(userByTelegram.id, {
          phone: normalizedPhone,
          isPhoneVerified: true,
          ...(telegramUsername && {
            telegramUsername,
          }),
        });
        this.logger.log(
          `[link] Success: telegramId=${telegramId} linked to phone=${normalizedPhone}`,
        );
        return { ok: true };
      } catch (err) {
        this.logger.error(
          `[link] Error linking phone for telegramId=${telegramId}`,
          err,
        );
        return { ok: false, reason: 'error' };
      }
    }

    const userByPhone = await this.userService.findByPhone(normalizedPhone);
    if (userByPhone) {
      const otherWithTelegram =
        await this.userService.findByTelegramId(telegramId);
      if (otherWithTelegram && otherWithTelegram.id !== userByPhone.id) {
        this.logger.warn(
          `[link] telegramId=${telegramId} already linked to another user`,
        );
        return { ok: false, reason: 'conflict' };
      }
      try {
        await this.userService.update(userByPhone.id, {
          telegramId,
          phone: normalizedPhone,
          isPhoneVerified: true,
          ...(telegramUsername && { telegramUsername }),
        });
        this.logger.log(
          `[link] Success: telegramId=${telegramId} saved for existing user (phone=${normalizedPhone}), userId=${userByPhone.id}`,
        );
        return { ok: true };
      } catch (err) {
        this.logger.error(
          `[link] Error saving telegramId for userId=${userByPhone.id}`,
          err,
        );
        return { ok: false, reason: 'error' };
      }
    }

    this.logger.warn(
      `[link] No user for telegramId=${telegramId} or phone=${normalizedPhone}`,
    );
    return { ok: false, reason: 'not_found' };
  }
}
