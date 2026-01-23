import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdToken } from './ad-token.entity';
import { User } from '../user/entities/user.entity';
import { v4 as uuidv4 } from 'uuid';
import { AdTokenType } from 'src/shared/types/ad-token';

@Injectable()
export class AdTokenService {
  constructor(
    @InjectRepository(AdToken)
    private readonly adTokenRepository: Repository<AdToken>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(reference: string, type: AdTokenType): Promise<AdToken> {
    const token = uuidv4();
    const adToken = this.adTokenRepository.create({
      token,
      reference,
      type,
    });
    return this.adTokenRepository.save(adToken);
  }

  async findByUserId(userId: string): Promise<AdToken | null> {
    return this.adTokenRepository.findOne({
      where: { reference: userId, type: AdTokenType.REFERRAL },
      relations: ['users'],
    });
  }

  async findAll(): Promise<AdToken[]> {
    return this.adTokenRepository.find({
      order: { createdAt: 'DESC' },
      where: { type: AdTokenType.ADS },
      relations: ['users'],
      select: {
        id: true,
        token: true,
        reference: true,
        clickCount: true,
        createdAt: true,
        users: {
          id: true,
          name: true,
          phone: true,
        },
      },
    });
  }

  async findByToken(token: string): Promise<AdToken | null> {
    return this.adTokenRepository.findOne({
      where: { token },
      relations: ['users'],
    });
  }

  async save(adToken: AdToken): Promise<AdToken> {
    return this.adTokenRepository.save(adToken);
  }

  /**
   * Подсчитывает количество приглашенных пользователей по реферальному токену
   */
  async getReferralCount(userId: string): Promise<number> {
    const referralToken = await this.findByUserId(userId);
    if (!referralToken || !referralToken.users) {
      return 0;
    }
    return referralToken.users.length;
  }

  /**
   * Связывает токен с пользователем
   */
  async associateTokenWithUser(token: string, userId: string): Promise<void> {
    const adToken = await this.findByToken(token);
    if (!adToken) {
      return; // Токен не найден, просто игнорируем
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    // Связываем токен с пользователем
    user.adToken = adToken;
    await this.userRepository.save(user);

    // Увеличиваем счетчик кликов
    adToken.clickCount += 1;
    await this.adTokenRepository.save(adToken);
  }
}
