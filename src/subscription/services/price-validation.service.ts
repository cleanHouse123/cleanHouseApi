import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionType } from '../entities/subscription.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';

export interface SubscriptionPriceConfig {
  [SubscriptionType.MONTHLY]: number;
  [SubscriptionType.YEARLY]: number;
  [SubscriptionType.ONE_TIME]: number;
}

@Injectable()
export class PriceValidationService {
  constructor(
    @InjectRepository(SubscriptionPlan)
    private readonly subscriptionPlanRepository: Repository<SubscriptionPlan>,
  ) {}

  // Fallback цены в копейках (если планы не найдены в БД)
  private readonly fallbackPrices: SubscriptionPriceConfig = {
    [SubscriptionType.MONTHLY]: 100000, // 1000 рублей
    [SubscriptionType.YEARLY]: 960000, // 9600 рублей
    [SubscriptionType.ONE_TIME]: 300000, // 3000 рублей
  };

  /**
   * Получает план подписки из БД по типу
   */
  async getSubscriptionPlan(
    subscriptionType: SubscriptionType,
  ): Promise<SubscriptionPlan | null> {
    return await this.subscriptionPlanRepository.findOne({
      where: { type: subscriptionType },
    });
  }

  /**
   * Получает ожидаемую цену для типа подписки из БД
   */
  async getExpectedPrice(subscriptionType: SubscriptionType): Promise<number> {
    const plan = await this.getSubscriptionPlan(subscriptionType);

    if (plan) {
      // Цена уже в копейках
      return plan.priceInKopecks;
    }

    // Используем fallback цены если план не найден в БД
    const fallbackPrice = this.fallbackPrices[subscriptionType];
    if (!fallbackPrice) {
      throw new BadRequestException(
        `Неподдерживаемый тип подписки: ${subscriptionType}`,
      );
    }

    return fallbackPrice;
  }

  /**
   * Валидирует соответствие цены типу подписки
   */
  async validatePrice(
    subscriptionType: SubscriptionType,
    amount: number,
  ): Promise<void> {
    const expectedPrice = await this.getExpectedPrice(subscriptionType);

    if (amount !== expectedPrice) {
      throw new BadRequestException(
        `Неверная сумма для подписки ${subscriptionType}. ` +
          `Ожидается: ${expectedPrice} копеек (${expectedPrice / 100} руб.), ` +
          `получено: ${amount} копеек (${amount / 100} руб.)`,
      );
    }
  }

  /**
   * Получает план подписки по ID
   */
  async getSubscriptionPlanById(planId: string): Promise<SubscriptionPlan> {
    const plan = await this.subscriptionPlanRepository.findOne({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException(`План подписки с ID ${planId} не найден`);
    }

    return plan;
  }

  /**
   * Валидирует платеж по ID плана подписки
   */
  async validatePaymentByPlanId(
    planId: string,
    amount: number,
  ): Promise<SubscriptionPlan> {
    const plan = await this.getSubscriptionPlanById(planId);

    if (amount !== plan.priceInKopecks) {
      throw new BadRequestException(
        `Неверная сумма для плана "${plan.name}". ` +
          `Ожидается: ${plan.priceInKopecks} копеек (${plan.priceInKopecks / 100} руб.), ` +
          `получено: ${amount} копеек (${amount / 100} руб.)`,
      );
    }

    return plan;
  }

  /**
   * Получает все доступные цены из БД
   */
  async getAllPrices(): Promise<{
    plans: SubscriptionPlan[];
    fallback: SubscriptionPriceConfig;
  }> {
    const plans = await this.subscriptionPlanRepository.find();
    return {
      plans,
      fallback: { ...this.fallbackPrices },
    };
  }

  /**
   * Проверяет, что сумма находится в допустимом диапазоне
   */
  validateAmountRange(amount: number): void {
    const minAmount = 100; // 1 рубль
    const maxAmount = 10000000; // 100000 рублей

    if (amount < minAmount) {
      throw new BadRequestException(
        `Минимальная сумма платежа: ${minAmount} копеек (${minAmount / 100} руб.)`,
      );
    }

    if (amount > maxAmount) {
      throw new BadRequestException(
        `Максимальная сумма платежа: ${maxAmount} копеек (${maxAmount / 100} руб.)`,
      );
    }
  }
}
