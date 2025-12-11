import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAddress } from '../entities/user-address';
import { CreateUserAddressDto } from '../dto/create-user-address.dto';

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
}