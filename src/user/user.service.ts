import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UserRole } from 'src/shared/types/user.role';
import * as bcrypt from 'bcrypt';
import { AdminResponseDto } from './dto/admin-response.dto';

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

  async createAdmin(createAdminDto: CreateAdminDto): Promise<User> {
    const existingUserByEmail = await this.findByEmail(createAdminDto.email);
    if (existingUserByEmail) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    const existingUserByPhone = await this.findByPhone(createAdminDto.phone);
    if (existingUserByPhone) {
      throw new ConflictException('Пользователь с таким номером телефона уже существует');
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(createAdminDto.password, saltRounds);

    const adminData = {
      name: createAdminDto.name,
      email: createAdminDto.email,
      phone: createAdminDto.phone,
      hash_password: hashedPassword,
      role: UserRole.ADMIN,
      isPhoneVerified: false,
      isEmailVerified: false,
    };

    const admin = this.userRepository.create(adminData);
    return this.userRepository.save(admin);
  }


  async getAdmins(): Promise<AdminResponseDto[]> {
    const admins = await this.userRepository.find({ where: { role: UserRole.ADMIN } });
    return admins.map((admin) => {
      return new AdminResponseDto(admin);
    });
  }

}
