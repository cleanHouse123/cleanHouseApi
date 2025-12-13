import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UserRole } from 'src/shared/types/user.role';
import * as bcrypt from 'bcrypt';
import { AdminResponseDto } from './dto/admin-response.dto';
import { FindUsersQueryDto } from './dto/filter-users.dto';
import { DEFAULT_LIMIT, DEFAULT_PAGE } from 'src/shared/constants';
import { UsersListDto } from './dto/users-list.dto';
import { CreateCurrierDto } from './dto/create-currier.dto';
import { AdTokenService } from '../ad-tokens/ad-token.service';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly adTokenService: AdTokenService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const { adToken, ...userData } = createUserDto;

    const user = this.userRepository.create(userData);

    if (adToken) {
      console.log('Searching for adToken:', adToken);
      const foundAdToken = await this.adTokenService.findByToken(adToken);
      console.log('Found adToken:', foundAdToken);

      if (foundAdToken) {
        console.log('Binding token to user');
        user.adToken = foundAdToken;
        foundAdToken.clickCount += 1;
        await this.adTokenService.save(foundAdToken);
        console.log(
          'Token bound successfully, new clickCount:',
          foundAdToken.clickCount,
        );
      } else {
        console.log('Token not found');
      }
    }

    const savedUser = await this.userRepository.save(user);
    return savedUser;
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id, deletedAt: IsNull() } });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { phone, deletedAt: IsNull() },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email, deletedAt: IsNull() },
    });
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

  async updateDeviceToken(userId: string, deviceToken: string): Promise<void> {
    await this.userRepository.update(userId, { deviceToken });
  }

  async update(id: string, updateUserDto: Partial<User>): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Проверяем уникальность телефона, если он обновляется
    if (updateUserDto.phone && updateUserDto.phone !== user.phone) {
      const existingUserByPhone = await this.userRepository.findOne({
        where: { phone: updateUserDto.phone, deletedAt: IsNull() },
      });
      if (existingUserByPhone && existingUserByPhone.id !== id) {
        throw new ConflictException(
          'Пользователь с таким номером телефона уже существует',
        );
      }
      // Сбрасываем верификацию телефона при изменении
      updateUserDto.isPhoneVerified = false;
    }

    // Проверяем уникальность email, если он обновляется
    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUserByEmail = await this.userRepository.findOne({
        where: { email: updateUserDto.email, deletedAt: IsNull() },
      });
      if (existingUserByEmail && existingUserByEmail.id !== id) {
        throw new ConflictException(
          'Пользователь с таким email уже существует',
        );
      }
      // Сбрасываем верификацию email при изменении
      updateUserDto.isEmailVerified = false;
    }

    return this.userRepository.save({ ...user, ...updateUserDto });
  }

  async remove(id: string): Promise<void> {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .where('user.id = :id', { id })
      .andWhere('user.deletedAt IS NULL')
      .getOne();

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    // Мягкое удаление - устанавливаем флаг deletedAt
    await this.userRepository.update(id, { deletedAt: new Date() });
  }

  async removeAdmin(id: string): Promise<void> {
    const admin = await this.userRepository
      .createQueryBuilder('user')
      .where('user.id = :id', { id })
      .andWhere('user.role = :role', { role: UserRole.ADMIN })
      .andWhere('user.deletedAt IS NULL')
      .getOne();

    if (!admin) {
      throw new NotFoundException('Администратор не найден');
    }

    // Мягкое удаление - устанавливаем флаг deletedAt
    await this.userRepository.update(id, { deletedAt: new Date() });
  }

  async createAdmin(createAdminDto: CreateAdminDto): Promise<User> {
    const existingUserByEmail = await this.findByEmail(createAdminDto.email);
    if (existingUserByEmail) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    const existingUserByPhone = await this.findByPhone(createAdminDto.phone);
    if (existingUserByPhone) {
      throw new ConflictException(
        'Пользователь с таким номером телефона уже существует',
      );
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(
      createAdminDto.password,
      saltRounds,
    );

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

  async createCurrier(createCurrierDto: CreateCurrierDto): Promise<User> {
    const existingUserByPhone = await this.findByPhone(createCurrierDto.phone);
    if (existingUserByPhone) {
      throw new ConflictException(
        'Пользователь с таким номером телефона уже существует',
      );
    }

    const currierData = {
      name: createCurrierDto.name,
      phone: createCurrierDto.phone,
      role: UserRole.CURRIER,
      isPhoneVerified: false,
      isEmailVerified: false,
    };

    const currier = this.userRepository.create(currierData);
    return this.userRepository.save(currier);
  }

  async getAdmins(): Promise<AdminResponseDto[]> {
    const admins = await this.userRepository
      .createQueryBuilder('user')
      .where('user.role = :role', { role: UserRole.ADMIN })
      .andWhere('user.deletedAt IS NULL')
      .getMany();
    return admins.map((admin) => ({
      id: admin.id,
      role: admin.role,
      name: admin.name,
      email: admin.email || '',
      phone: admin.phone,
      isPhoneVerified: admin.isPhoneVerified,
      isEmailVerified: admin.isEmailVerified,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    }));
  }

  async getAllUsers(query: FindUsersQueryDto): Promise<{
    data: UsersListDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const queryBuilder = this.userRepository.createQueryBuilder('user');

    queryBuilder
      .where('user.role != :adminRole', {
        adminRole: UserRole.ADMIN,
      })
      .andWhere('user.deletedAt IS NULL');

    if (query.name) {
      queryBuilder.andWhere('user.name ILIKE :name', {
        name: `%${query.name}%`,
      });
    }
    if (query.phone) {
      queryBuilder.andWhere('user.phone ILIKE :phone', {
        phone: `%${query.phone}%`,
      });
    }
    if (query.email) {
      queryBuilder.andWhere('user.email ILIKE :email', {
        email: `%${query.email}%`,
      });
    }
    if (query.role) {
      queryBuilder.andWhere('user.role = :role', { role: query.role });
    }

    const currentPage = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    queryBuilder.skip((currentPage - 1) * limit).take(limit);

    const [users, total] = await queryBuilder.getManyAndCount();

    return {
      data: users.map((user) => ({
        id: user.id,
        role: user.role,
        name: user.name,
        email: user.email || '',
        phone: user.phone,
        isPhoneVerified: user.isPhoneVerified,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })),
      total,
      page: currentPage,
      limit,
    };
  }
}
