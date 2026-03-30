import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  /** Разовый заказ: 1 пакет */
  private readonly PRICE_ONE_PACKAGE = 14900;
  /** Разовый заказ: 2 пакета (до 60 л) */
  private readonly PRICE_TWO_PACKAGES = 19900;
  private readonly FIRST_ORDER_PRICE = 100;

  /** Ступени для 3+ пакетов (как раньше) */
  private readonly PRICE_THREE_PACKAGES = 24900;
  private readonly PRICE_FOUR_PACKAGES = 34900;
  private readonly PRICE_FIVE_PACKAGES = 39900;

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
      numberPackages = 2,
      addressId,
      address,
      addressDetails,
    } = params;

    // Базовая цена за один пакет (для логики «первого заказа»)
    let basePricePerPackage: number = this.PRICE_ONE_PACKAGE;

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
          const hasOtherAddressWithFlag =
            await this.hasFirstOrderForDaDataAddress(
              userAddress.address,
              userAddress.addressDetails as AddressDetailsComparable,
            );
          isAddressEligible = !hasOtherAddressWithFlag;
        }
      }
    } else if (address) {
      // Fallback: проверяем по текстовому адресу (старая логика)
      isAddressEligible = !(await this.hasFirstOrderForAddress(
        address,
        addressDetails,
      ));
    }

    if (userId) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (user) {
        // Проверяем, есть ли у пользователя ЛЮБОЙ заказ за 1 рубль (независимо от статуса)
        // Это строгая проверка - один аккаунт = один первый заказ
        // Первый заказ всегда стоит 1 рубль, независимо от статуса (NEW, PAID, CANCELED и т.д.)
        const hasFirstOrder = await this.orderRepository.findOne({
          where: {
            customerId: userId,
            price: this.FIRST_ORDER_PRICE, // 1 рубль в копейках
            // Не проверяем статус - любой заказ за 1 рубль означает, что первый заказ использован
          },
        });

        // Если уже есть заказ за 1 рубль (в любом статусе), первый заказ уже использован
        const isUserFirstOrder = !hasFirstOrder;

        if (isUserFirstOrder && isAddressEligible) {
          basePricePerPackage = this.FIRST_ORDER_PRICE;
        }
      }
    }

    const isFirstOrder = basePricePerPackage === this.FIRST_ORDER_PRICE;
    const perExtraAfterFive = this.PRICE_ONE_PACKAGE;

    // Разовые тарифы: 1 пакет — 149 ₽, 2 пакета — 199 ₽; 3+ — прежние ступени
    if (numberPackages === 1) {
      return isFirstOrder ? basePricePerPackage : this.PRICE_ONE_PACKAGE;
    }

    if (numberPackages === 2) {
      if (isFirstOrder) {
        return basePricePerPackage + this.PRICE_TWO_PACKAGES;
      }
      return this.PRICE_TWO_PACKAGES;
    }

    if (numberPackages === 3) {
      if (isFirstOrder) {
        return (
          basePricePerPackage +
          (this.PRICE_THREE_PACKAGES - this.FIRST_ORDER_PRICE)
        );
      }
      return this.PRICE_THREE_PACKAGES;
    }

    if (numberPackages === 4) {
      if (isFirstOrder) {
        return (
          basePricePerPackage +
          (this.PRICE_FOUR_PACKAGES - this.FIRST_ORDER_PRICE)
        );
      }
      return this.PRICE_FOUR_PACKAGES;
    }

    if (numberPackages === 5) {
      if (isFirstOrder) {
        return (
          basePricePerPackage +
          (this.PRICE_FIVE_PACKAGES - this.FIRST_ORDER_PRICE)
        );
      }
      return this.PRICE_FIVE_PACKAGES;
    }

    if (isFirstOrder && numberPackages > 1) {
      return (
        basePricePerPackage +
        (this.PRICE_FIVE_PACKAGES - this.FIRST_ORDER_PRICE) +
        (numberPackages - 5) * perExtraAfterFive
      );
    }
    return (
      this.PRICE_FIVE_PACKAGES + (numberPackages - 5) * perExtraAfterFive
    );
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
        return this.PRICE_ONE_PACKAGE;
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
      .where(
        'userAddress.usageFeatures @> ARRAY[CAST(:feature AS address_usage_feature_enum)]',
        {
          feature: AddressUsageFeature.FIRST_ORDER_USED,
        },
      )
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
