import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const user = this.userRepository.create(createUserDto);
    return this.userRepository.save(user);
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { phone } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async updatePhoneVerification(
    userId: string,
    isVerified: boolean,
  ): Promise<void> {
    await this.userRepository.update(userId, { isPhoneVerified: isVerified });
  }

  async updateEmailVerification(
    userId: string,
    isVerified: boolean,
  ): Promise<void> {
    await this.userRepository.update(userId, { isEmailVerified: isVerified });
  }

  async updateRefreshToken(
    userId: string,
    refreshTokenHash: string,
  ): Promise<void> {
    await this.userRepository.update(userId, { refreshTokenHash });
  }

  async invalidateRefreshToken(userId: string): Promise<void> {
    await this.userRepository.update(userId, { refreshTokenHash: undefined });
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.userRepository.update(userId, {
      lastLoginAt: new Date(),
    });
  }

  async update(id: string, updateUserDto: Partial<User>): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.userRepository.save({ ...user, ...updateUserDto });
  }

  async remove(id: string): Promise<void> {
    await this.userRepository.delete(id);
  }

}
