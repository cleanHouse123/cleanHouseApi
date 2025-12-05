import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { AdTokenService } from '../ad-token.service';
import { AdToken } from '../ad-token.entity';
import { AdTokenType } from 'src/shared/types/ad-token';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ApiBearerAuth } from '@nestjs/swagger';
import { GetUserMetadata, UserMetadata } from 'src/shared/decorators/get-user.decorator';

@Controller('client/token')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
export class AdTokenController {
  constructor(private readonly adTokenService: AdTokenService) {}

  @Post('referral')
  async createReferral(@GetUserMetadata() user: UserMetadata): Promise<AdToken> {
    return this.adTokenService.create(user.userId, AdTokenType.REFERRAL);
  }

  @Get()
  async findByUser(@GetUserMetadata() user: UserMetadata): Promise<AdToken | null> {
    return this.adTokenService.findByUserId(user.userId);
  }
}
