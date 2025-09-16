import { Injectable, BadRequestException } from '@nestjs/common';
import { SubscriptionType } from '../entities/subscription.entity';

export interface SubscriptionPriceConfig {
  [SubscriptionType.MONTHLY]: number;
  [SubscriptionType.YEARLY]: number;
  [SubscriptionType.ONE_TIME]: number;
}

@Injectable()
export class PriceValidationService {
  // Цены в копейках (можно вынести в конфигурацию)
  private readonly subscriptionPrices: SubscriptionPriceConfig = {
    [SubscriptionType.MONTHLY]: 150000, // 1500 рублей
    [SubscriptionType.YEARLY]: 1500000, // 15000 рублей (10 месяцев по цене)
    [SubscriptionType.ONE_TIME]: 300000, // 3000 рублей
  };

  /**
   * Получает ожидаемую цену для типа подписки
   */
  getExpectedPrice(subscriptionType: SubscriptionType): number {
    const price = this.subscriptionPrices[subscriptionType];
    if (!price) {
      throw new BadRequestException(
        `Неподдерживаемый тип подписки: ${subscriptionType}`,
      );
    }
    return price;
  }

  /**
   * Валидирует соответствие цены типу подписки
   */
  validatePrice(subscriptionType: SubscriptionType, amount: number): void {
    const expectedPrice = this.getExpectedPrice(subscriptionType);

    if (amount !== expectedPrice) {
      throw new BadRequestException(
        `Неверная сумма для подписки ${subscriptionType}. ` +
          `Ожидается: ${expectedPrice} копеек (${expectedPrice / 100} руб.), ` +
          `получено: ${amount} копеек (${amount / 100} руб.)`,
      );
    }
  }

  /**
   * Получает все доступные цены
   */
  getAllPrices(): SubscriptionPriceConfig {
    return { ...this.subscriptionPrices };
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
