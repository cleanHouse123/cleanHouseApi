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

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  async getOrderPrice(userId?: string): Promise<number> {
    if (!userId) {
      return this.ORDER_PRICE;
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return this.ORDER_PRICE;
    }

    const ordersCount = await this.orderRepository.count({
      where: { customerId: userId },
    });

    return ordersCount === 0 ? this.FIRST_ORDER_PRICE : this.ORDER_PRICE;
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
