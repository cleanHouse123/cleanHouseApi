import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { Order, OrderStatus } from '../order/entities/order.entity';
import { UserAddress } from '../address/entities/user-address';
import { AddressUsageFeature } from '../shared/types/address-features';
import { DaDataAddressDataNormalized } from '../address/interfaces/address-data.interface';
import {
  AddressDetailsComparable,
  normalizeAddressForComparison,
  compareDaDataAddresses,
} from '../shared/utils/address-normalizer.util';

export enum PriceType {
  ORDER_SINGLE = 'order_single',
  SUBSCRIPTION_MONTHLY = 'subscription_monthly',
  SUBSCRIPTION_YEARLY = 'subscription_yearly',
}

export interface GetOrderPriceParams {
  userId?: string;
  numberPackages?: number;
  addressId?: string;
  address?: string;
  addressDetails?: AddressDetailsComparable | null;
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
    @InjectRepository(UserAddress)
    private readonly userAddressRepository: Repository<UserAddress>,
  ) {}

  async getOrderPrice(params: GetOrderPriceParams = {}): Promise<number> {
    const {
      userId,
      numberPackages = 1,
      addressId,
      address,
      addressDetails,
    } = params;

    // Определяем базовую цену за один пакет
    let basePricePerPackage: number = this.ORDER_PRICE;

    // Проверяем, может ли адрес получить скидку первого заказа
    let isAddressEligible = false;

    if (addressId) {
      // Если передан addressId, проверяем флаг в user-address
      const userAddress = await this.userAddressRepository.findOne({
        where: { id: addressId },
      });

      if (userAddress) {
        // Проверяем, не использован ли уже первый заказ для этого конкретного адреса
        const hasFirstOrderFlag = userAddress.usageFeatures.includes(
          AddressUsageFeature.FIRST_ORDER_USED,
        );

        if (hasFirstOrderFlag) {
          // Флаг уже стоит - адрес не может получить скидку
          isAddressEligible = false;
        } else {
          // Флага нет, но нужно проверить, нет ли других адресов с таким же DaData,
          // у которых уже использован первый заказ (защита от дублирования адресов)
          const hasOtherAddressWithFlag = await this.hasFirstOrderForDaDataAddress(
            userAddress.address,
            userAddress.addressDetails as AddressDetailsComparable,
          );
          isAddressEligible = !hasOtherAddressWithFlag;
        }
      }
    } else if (address) {
      // Fallback: проверяем по текстовому адресу (старая логика)
      isAddressEligible = !(await this.hasFirstOrderForAddress(address, addressDetails));
    }

    if (userId) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (user) {
        const ordersCount = await this.orderRepository.count({
          where: { 
            customerId: userId,
            status: Not(OrderStatus.NEW),
          },
        });
        const isUserFirstOrder = ordersCount === 0;
        if (isUserFirstOrder && isAddressEligible) {
          basePricePerPackage = this.FIRST_ORDER_PRICE;
        }
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

  /**
   * Проверяет, был ли уже первый заказ на адрес (по текстовому адресу).
   * Используется как fallback, когда addressId не передан.
   */
  private async hasFirstOrderForAddress(
    address: string,
    addressDetails?: AddressDetailsComparable | null,
  ): Promise<boolean> {
    const normalizedInput = normalizeAddressForComparison(
      address,
      addressDetails,
    );

    const firstOrders = await this.orderRepository.find({
      where: { price: this.FIRST_ORDER_PRICE },
      select: ['address', 'addressDetails'],
    });

    for (const order of firstOrders) {
      const normalizedExisting = normalizeAddressForComparison(
        order.address,
        order.addressDetails as AddressDetailsComparable,
      );
      if (normalizedExisting === normalizedInput) {
        return true;
      }
    }

    return false;
  }

  /**
   * Проверяет, был ли уже первый заказ на адрес по DaData (для сравнения с другими адресами).
   * Используется для поиска совпадений по всем user-address с флагом FIRST_ORDER_USED.
   */
  async hasFirstOrderForDaDataAddress(
    address: DaDataAddressDataNormalized | null,
    addressDetails: AddressDetailsComparable | null | undefined,
  ): Promise<boolean> {
    if (!address) {
      return false;
    }

    // Находим все адреса с флагом FIRST_ORDER_USED
    // Используем оператор @> для проверки наличия значения в массиве enum
    // Используем правильный синтаксис для PostgreSQL enum массивов с параметризованным запросом
    const addressesWithFlag = await this.userAddressRepository
      .createQueryBuilder('userAddress')
      .where('userAddress.usageFeatures @> ARRAY[CAST(:feature AS address_usage_feature_enum)]', {
        feature: AddressUsageFeature.FIRST_ORDER_USED,
      })
      .getMany();

    // Сравниваем с каждым адресом
    for (const userAddress of addressesWithFlag) {
      if (
        compareDaDataAddresses(
          address,
          addressDetails,
          userAddress.address,
          userAddress.addressDetails as AddressDetailsComparable,
        )
      ) {
        return true;
      }
    }

    return false;
  }
}
