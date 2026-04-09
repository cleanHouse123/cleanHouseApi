import { Injectable, Logger } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { normalizePhoneToE164 } from '../shared/utils/phone-normalizer.util';
import { User } from '../user/entities/user.entity';

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

  private isUniqueViolation(error: any): boolean {
    return (
      error?.code === '23505' ||
      error?.message?.includes('duplicate key') ||
      error?.message?.includes('unique constraint')
    );
  }

  private async resolvePhoneOwner(normalizedPhone: string): Promise<User | null> {
    const userByPhoneAny =
      await this.userService.findByPhoneIncludingDeleted(normalizedPhone);
    if (!userByPhoneAny) {
      return null;
    }

    if (!userByPhoneAny.deletedAt) {
      return userByPhoneAny;
    }

    try {
      return await this.userService.restore(userByPhoneAny.id);
    } catch (restoreError) {
      if (!this.isUniqueViolation(restoreError)) {
        throw restoreError;
      }

      const activeUserByPhone = await this.userService.findByPhone(normalizedPhone);
      if (activeUserByPhone) {
        return activeUserByPhone;
      }

      throw restoreError;
    }
  }

  private async saveTelegramToUser(
    targetUser: User,
    telegramId: string,
    normalizedPhone: string,
    telegramUsername?: string,
  ): Promise<LinkPhoneResult> {
    if (targetUser.telegramId && targetUser.telegramId !== telegramId) {
      this.logger.warn(
        `[link] telegramId conflict for userId=${targetUser.id}: existing=${targetUser.telegramId}, incoming=${telegramId}`,
      );
      return { ok: false, reason: 'conflict' };
    }

    try {
      await this.userService.update(targetUser.id, {
        telegramId,
        phone: normalizedPhone,
        isPhoneVerified: true,
        ...(telegramUsername && { telegramUsername }),
      });
      this.logger.log(
        `[link] Success: telegramId=${telegramId} saved for userId=${targetUser.id} (phone=${normalizedPhone})`,
      );
      return { ok: true };
    } catch (err) {
      this.logger.error(
        `[link] Error saving telegramId for userId=${targetUser.id}`,
        err,
      );
      return { ok: false, reason: 'error' };
    }
  }

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

    try {
      const userByTelegram = await this.userService.findByTelegramId(telegramId);
      const phoneOwner = await this.resolvePhoneOwner(normalizedPhone);

      // Если есть аккаунт по telegramId и номер свободен или принадлежит ему — просто обновляем.
      if (
        userByTelegram &&
        (!phoneOwner || phoneOwner.id === userByTelegram.id)
      ) {
        await this.userService.update(userByTelegram.id, {
          phone: normalizedPhone,
          isPhoneVerified: true,
          ...(telegramUsername && { telegramUsername }),
        });
        this.logger.log(
          `[link] Success: telegramId=${telegramId} linked to phone=${normalizedPhone}`,
        );
        return { ok: true };
      }

      // Если номер уже принадлежит другому аккаунту:
      // переводим telegram-привязку на владельца номера, освобождая текущую.
      if (userByTelegram && phoneOwner && phoneOwner.id !== userByTelegram.id) {
        if (phoneOwner.telegramId && phoneOwner.telegramId !== telegramId) {
          this.logger.warn(
            `[link] Phone conflict: ${normalizedPhone} already linked to another telegramId=${phoneOwner.telegramId}`,
          );
          return { ok: false, reason: 'conflict' };
        }

        await this.userService.clearTelegramLink(userByTelegram.id);
        return this.saveTelegramToUser(
          phoneOwner,
          telegramId,
          normalizedPhone,
          telegramUsername,
        );
      }

      // Если аккаунта по telegramId нет, но по номеру есть — записываем telegramId в владельца номера.
      if (!userByTelegram && phoneOwner) {
        return this.saveTelegramToUser(
          phoneOwner,
          telegramId,
          normalizedPhone,
          telegramUsername,
        );
      }
    } catch (err) {
      this.logger.error(
        `[link] Error linking phone for telegramId=${telegramId}`,
        err,
      );
      return { ok: false, reason: 'error' };
    }

    this.logger.warn(
      `[link] No user for telegramId=${telegramId} or phone=${normalizedPhone}`,
    );
    return { ok: false, reason: 'not_found' };
  }
}
