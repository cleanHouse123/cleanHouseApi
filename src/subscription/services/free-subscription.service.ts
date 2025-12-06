import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { AdTokenService } from '../../ad-tokens/ad-token.service';

export interface FreeSubscriptionEligibility {
  eligible: boolean;
  reason?: string;
  referralCount?: number;
}

@Injectable()
export class FreeSubscriptionService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly adTokenService: AdTokenService,
  ) {}

  /**
   * Проверяет, имеет ли пользователь право на бесплатную подписку
   * Возвращает true если право есть, false если нет
   */
  async checkEligibilityForFreeSubscription(
    userId: string,
  ): Promise<FreeSubscriptionEligibility> {
    // Получаем пользователя
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return { eligible: false, reason: 'Пользователь не найден' };
    }

    // Проверяем, использовал ли уже бесплатную подписку
    if (user.hasUsedFreeReferralSubscription) {
      return {
        eligible: false,
        reason: 'Бесплатная подписка уже была использована',
      };
    }

    // Подсчитываем количество приглашенных
    const referralCount = await this.adTokenService.getReferralCount(userId);
    if (referralCount < 3) {
      return {
        eligible: false,
        reason: `Недостаточно приглашенных пользователей. Требуется: 3, текущее: ${referralCount}`,
        referralCount,
      };
    }

    return { eligible: true, referralCount };
  }

  /**
   * Помечает, что пользователь использовал бесплатную подписку
   * Использует transaction manager для атомарности
   */
  async markFreeSubscriptionUsed(
    userId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager
      ? manager.getRepository(User)
      : this.userRepository;

    // Используем SELECT FOR UPDATE для предотвращения race condition
    const user = await repository.findOne({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!user) {
      throw new Error('Пользователь не найден');
    }

    // Проверяем еще раз, не использовал ли уже (защита от race condition)
    if (user.hasUsedFreeReferralSubscription) {
      throw new Error('Бесплатная подписка уже была использована');
    }

    await repository.update(
      { id: userId },
      { hasUsedFreeReferralSubscription: true },
    );
  }

  /**
   * Подсчитывает количество использованных бесплатных подписок (для будущих ограничений)
   */
  async countUsedFreeSubscriptions(): Promise<number> {
    return await this.userRepository.count({
      where: { hasUsedFreeReferralSubscription: true },
    });
  }
}

