import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdToken } from './ad-token.entity';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AdTokenService {
  constructor(
    @InjectRepository(AdToken)
    private readonly adTokenRepository: Repository<AdToken>,
  ) {}

  async create(reference: string): Promise<AdToken> {
    const token = uuidv4();
    const adToken = this.adTokenRepository.create({
      token,
      reference,
    });
    return this.adTokenRepository.save(adToken);
  }

  async findAll(): Promise<AdToken[]> {
    return this.adTokenRepository.find({
      order: { createdAt: 'DESC' },
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
}
