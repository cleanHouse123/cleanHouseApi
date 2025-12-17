import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { AdTokenService } from '../../ad-tokens/ad-token.service';
import { UsageFeaturesEnum } from 'src/shared/types/user-feutures';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { ReferralFreeSubscriptionUsage } from '../entities/referral-free-subscription-usage.entity';

export interface FreeSubscriptionEligibility {
  eligible: boolean;
  reason?: string;
  referralCount?: number;
  requiredReferrals?: number;
  planId?: string;
}

@Injectable()
export class FreeSubscriptionService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(SubscriptionPlan)
    private readonly subscriptionPlanRepository: Repository<SubscriptionPlan>,
    @InjectRepository(ReferralFreeSubscriptionUsage)
    private readonly usageRepository: Repository<ReferralFreeSubscriptionUsage>,
    private readonly adTokenService: AdTokenService,
  ) {}

  /**
   * Проверяет, имеет ли пользователь право на бесплатную подписку по конкретному плану
   * Возвращает объект с флагом доступности и дополнительной информацией
   */
  async checkEligibilityForFreeSubscription(
    userId: string,
    planId: string,
  ): Promise<FreeSubscriptionEligibility> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return { eligible: false, reason: 'Пользователь не найден' };
    }

    const plan = await this.subscriptionPlanRepository.findOne({
      where: { id: planId },
    });

    if (!plan) {
      return {
        eligible: false,
        reason: 'План подписки не найден',
      };
    }

    if (!plan.isReferralFreeEnabled) {
      return {
        eligible: false,
        reason: 'Этот план нельзя получить бесплатно по реферальной программе',
        planId: plan.id,
      };
    }

    // Проверяем, не использовал ли пользователь уже бесплатную подписку по этому плану
    const existingUsage = await this.usageRepository.findOne({
      where: { userId, subscriptionPlanId: planId },
    });

    if (existingUsage) {
      return {
        eligible: false,
        reason: 'Бесплатная подписка по этому плану уже была использована',
        planId: plan.id,
      };
    }

    // Подсчитываем количество приглашенных
    const referralCount = await this.adTokenService.getReferralCount(userId);
    if (referralCount < plan.minReferralsForFree) {
      return {
        eligible: false,
        reason: `Недостаточно приглашенных пользователей. Требуется: ${plan.minReferralsForFree}, текущее: ${referralCount}`,
        referralCount,
        requiredReferrals: plan.minReferralsForFree,
        planId: plan.id,
      };
    }

    return {
      eligible: true,
      referralCount,
      requiredReferrals: plan.minReferralsForFree,
      planId: plan.id,
    };
  }

  /**
   * Помечает, что пользователь использовал бесплатную подписку по конкретному плану
   * Использует transaction manager для атомарности
   */
  async markFreeSubscriptionUsed(
    userId: string,
    planId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const userRepository = manager
      ? manager.getRepository(User)
      : this.userRepository;
    const usageRepository = manager
      ? manager.getRepository(ReferralFreeSubscriptionUsage)
      : this.usageRepository;
    const subscriptionPlanRepository = manager
      ? manager.getRepository(SubscriptionPlan)
      : this.subscriptionPlanRepository;

    const plan = await subscriptionPlanRepository.findOne({
      where: { id: planId },
    });

    if (!plan) {
      throw new Error('План подписки не найден');
    }

    if (!plan.isReferralFreeEnabled) {
      throw new Error(
        'Этот план нельзя получить бесплатно по реферальной программе',
      );
    }

    // Используем SELECT FOR UPDATE для предотвращения race condition по пользователю
    const user = await userRepository.findOne({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!user) {
      throw new Error('Пользователь не найден');
    }

    // Проверяем еще раз, не использовал ли уже этот план (защита от race condition)
    const existingUsage = await usageRepository.findOne({
      where: { userId, subscriptionPlanId: planId },
      lock: { mode: 'pessimistic_write' },
    });

    if (existingUsage) {
      throw new Error('Бесплатная подписка по этому плану уже была использована');
    }

    // Создаем запись использования бесплатной подписки по плану
    const usage = usageRepository.create({
      userId,
      subscriptionPlanId: planId,
    });

    await usageRepository.save(usage);

    // Добавляем в массив usageFeatures общий флаг, если еще нет (для обратной совместимости и аналитики)
    const updatedFeatures = user.usageFeatures || [];
    if (!updatedFeatures.includes(UsageFeaturesEnum.FREE_REFERRAL_SUBSCRIPTION)) {
      updatedFeatures.push(UsageFeaturesEnum.FREE_REFERRAL_SUBSCRIPTION);
    }

    await userRepository.update(
      { id: userId },
      { usageFeatures: updatedFeatures },
    );
  }

  /**
   * Подсчитывает количество использованных бесплатных подписок (для будущих ограничений)
   */
  async countUsedFreeSubscriptions(): Promise<number> {
    return this.usageRepository.count();
  }

  /**
   * Проверяет, использовал ли пользователь какую-либо бесплатную подписку по рефералам
   * (для отображения в UI и дополнительных проверок)
   */
  async hasAnyUsedFreeSubscription(userId: string): Promise<boolean> {
    const hasUsage = await this.usageRepository.findOne({
      where: { userId },
      select: ['id'],
    });

    if (hasUsage) {
      return true;
    }

    // Обратная совместимость: проверяем старый флаг в usageFeatures
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'usageFeatures'],
    });

    return (
      !!user?.usageFeatures?.includes(
        UsageFeaturesEnum.FREE_REFERRAL_SUBSCRIPTION,
      ) || false
    );
  }
}

