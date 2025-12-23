import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAddress } from '../entities/user-address';
import { CreateUserAddressDto } from '../dto/create-user-address.dto';
import { DEFAULT_LIMIT, DEFAULT_PAGE } from 'src/shared/constants';

@Injectable()
export class UserAddressService {
  constructor(
    @InjectRepository(UserAddress)
    private readonly userAddressRepository: Repository<UserAddress>,
  ) {}

  async createUserAddress(
    userId: string,
    payload: CreateUserAddressDto,
  ): Promise<UserAddress> {
    if (payload.isSupportableArea) {
      await this.userAddressRepository.update(
        { userId },
        { isPrimary: false },
      );
    }

    const newAddress = this.userAddressRepository.create({
      userId,
      address: payload.address,
      isPrimary: payload.isSupportableArea ? true : false,
      isSupportableArea: payload.isSupportableArea ?? false,
      addressDetails: payload.addressDetails ?? null,
    });

    return this.userAddressRepository.save(newAddress);
  }

  async getUserAddresses(userId: string): Promise<UserAddress[]> {
    return this.userAddressRepository.find({
      where: { userId },
      order: { created_at: 'DESC' },
    });
  }

  async deleteUserAddress(id: string): Promise<void> {
    await this.userAddressRepository.delete(id);
  }

  async findAllWithPagination(params: {
    page?: number;
    limit?: number;
    userId?: string;
    addressName?: string;
  }): Promise<{
    data: UserAddress[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      page = DEFAULT_PAGE,
      limit = DEFAULT_LIMIT,
      userId,
      addressName,
    } = params;


    const queryBuilder = this.userAddressRepository.createQueryBuilder('userAddress').leftJoinAndSelect('userAddress.user', 'user');


    console.log(userId, "userIduserIduserIduserIduserId");
    
    if (userId) {
        queryBuilder.andWhere(
          '(CAST("user"."id" AS TEXT) ILIKE :userId)',
          { userId: `%${userId}%` }
        );
    }

    if (addressName) {
      // Используем имя таблицы в кавычках для работы с JSONB полями
      // TypeORM не может правильно обработать алиас в JSONB функциях
      queryBuilder.andWhere(
        '("userAddress"."address"->>\'display\' ILIKE :addressName OR "userAddress"."address"->>\'unrestricted_value\' ILIKE :addressName OR "userAddress"."address"->>\'value\' ILIKE :addressName)',
        { addressName: `%${addressName}%` }
      );
    }

    // Сортировка по дате создания от новых к старым
    queryBuilder.orderBy('userAddress.created_at', 'DESC');

    // Пагинация
    queryBuilder.skip((page - 1) * limit).take(limit);

    const [addresses, total] = await queryBuilder.getManyAndCount();

    return {
      data: addresses,
      total,
      page,
      limit,
    };
  }

  async getMostCommonStreets(limit: number = 10): Promise<{ street: string; count: number }[]> {
    const addresses = await this.userAddressRepository.find({
      where: {},
      select: ['address'],
    });

    const streetCounts = new Map<string, number>();

    addresses.forEach((address) => {
      if (address.address) {
        const street = address.address.street_with_type || address.address.street;
        if (street) {
          const currentCount = streetCounts.get(street) || 0;
          streetCounts.set(street, currentCount + 1);
        }
      }
    });

    const sortedStreets = Array.from(streetCounts.entries())
      .map(([street, count]) => ({ street, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return sortedStreets;
  }
}