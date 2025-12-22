import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { Order } from '../order/entities/order.entity';

export enum PriceType {
  ORDER_SINGLE = 'order_single',
  SUBSCRIPTION_MONTHLY = 'subscription_monthly',
  SUBSCRIPTION_YEARLY = 'subscription_yearly',
}

@Injectable()
export class PriceService {
  private readonly ORDER_PRICE = 14900;
  private readonly FIRST_ORDER_PRICE = 100;

  private readonly PRICE_PER_PACKAGE = 14900;
  private readonly PRICE_PER_PACKAGE_2 = 24900;
  private readonly PRICE_PER_PACKAGE_3 = 34900;
  private readonly PRICE_PER_PACKAGE_4 = 39900;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  async getOrderPrice(
    userId?: string,
    numberPackages: number = 1,
  ): Promise<number> {
    // Определяем базовую цену за один пакет
    let basePricePerPackage: number;
    
    if (!userId) {
      basePricePerPackage = this.ORDER_PRICE;
    } else {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        basePricePerPackage = this.ORDER_PRICE;
      } else {
        const ordersCount = await this.orderRepository.count({
          where: { customerId: userId },
        });
        basePricePerPackage =
          ordersCount === 0 ? this.FIRST_ORDER_PRICE : this.ORDER_PRICE;
      }
    }

    // Если это первый заказ (скидка), скидка применяется только к первому пакету
    // Остальные пакеты по полной цене (149 руб)
    const isFirstOrder = basePricePerPackage === this.FIRST_ORDER_PRICE;
    const fullPrice = this.ORDER_PRICE; // 149 рублей в копейках

    // Расчет финальной цены в зависимости от количества пакетов
    // 1 пакет: 149 руб, 2 пакета: 249 руб, 3 пакета: 349 руб, 4 пакета: 399 руб
    if (numberPackages === 1) {
      return isFirstOrder ? basePricePerPackage : this.PRICE_PER_PACKAGE; // 149 руб
    } else if (numberPackages === 2) {
      if (isFirstOrder) {
        // Первый пакет со скидкой (1 руб) + второй по полной цене (149 руб)
        return basePricePerPackage + fullPrice;
      }
      return this.PRICE_PER_PACKAGE_2; // 249 руб
    } else if (numberPackages === 3) {
      if (isFirstOrder) {
        // Первый пакет со скидкой (1 руб) + два по полной цене (149 руб каждый)
        return basePricePerPackage + 2 * fullPrice;
      }
      return this.PRICE_PER_PACKAGE_3; // 349 руб
    } else if (numberPackages === 4) {
      if (isFirstOrder) {
        // Первый пакет со скидкой (1 руб) + три по полной цене (149 руб каждый)
        return basePricePerPackage + 3 * fullPrice;
      }
      return this.PRICE_PER_PACKAGE_4; // 399 руб
    } else {
      // Для большего количества пакетов используем стандартную логику
      if (isFirstOrder && numberPackages > 1) {
        // Первый пакет со скидкой + остальные по полной цене
        return basePricePerPackage + (numberPackages - 1) * fullPrice;
      } else {
        // Обычный расчет: цена * количество пакетов
        return basePricePerPackage * numberPackages;
      }
    }
  }

  async getPriceByType(type: PriceType): Promise<number> {
    switch (type) {
      case PriceType.ORDER_SINGLE:
        return this.getOrderPrice();
      case PriceType.SUBSCRIPTION_MONTHLY:
        return 100000;
      case PriceType.SUBSCRIPTION_YEARLY:
        return 960000;
      default:
        return this.ORDER_PRICE;
    }
  }
}
