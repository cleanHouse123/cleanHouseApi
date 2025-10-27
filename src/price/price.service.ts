import { Injectable } from '@nestjs/common';

export enum PriceType {
  ORDER_SINGLE = 'order_single',
  SUBSCRIPTION_MONTHLY = 'subscription_monthly',
  SUBSCRIPTION_YEARLY = 'subscription_yearly',
}

@Injectable()
export class PriceService {
  private readonly ORDER_PRICE = 14900;

  async getOrderPrice(): Promise<number> {
    return this.ORDER_PRICE;
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
