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

  async link(telegramId: string, rawPhoneNumber: string): Promise<LinkPhoneResult> {
    let normalizedPhone: string;
    try {
      normalizedPhone = normalizePhoneToE164(rawPhoneNumber);
    } catch {
      this.logger.warn(`[link] Invalid phone from telegramId=${telegramId}: ${rawPhoneNumber}`);
      return { ok: false, reason: 'invalid_phone' };
    }

    const user = await this.userService.findByTelegramId(telegramId);
    if (!user) {
      this.logger.warn(`[link] User not found for telegramId=${telegramId}`);
      return { ok: false, reason: 'not_found' };
    }

    const existingByPhone = await this.userService.findByPhone(normalizedPhone);
    if (existingByPhone && existingByPhone.id !== user.id) {
      this.logger.warn(
        `[link] Phone conflict: ${normalizedPhone} already linked to userId=${existingByPhone.id}, telegramId=${telegramId}`,
      );
      return { ok: false, reason: 'conflict' };
    }

    try {
      await this.userService.update(user.id, {
        phone: normalizedPhone,
        isPhoneVerified: true,
      });
      this.logger.log(`[link] Success: telegramId=${telegramId} linked to phone=${normalizedPhone}`);
      return { ok: true };
    } catch (err) {
      this.logger.error(`[link] Error linking phone for telegramId=${telegramId}`, err);
      return { ok: false, reason: 'error' };
    }
  }
}
