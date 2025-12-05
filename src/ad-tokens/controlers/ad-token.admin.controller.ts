import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { AdTokenType } from 'src/shared/types/ad-token';
import { AdToken } from '../ad-token.entity';
import { AdTokenService } from '../ad-token.service';

@Controller('admin/tokens')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
export class AdTokenAdminController {
  constructor(private readonly adTokenService: AdTokenService) {}

  @Post()
  async create(@Body() body: { reference: string }): Promise<AdToken> {
    return this.adTokenService.create(body.reference, AdTokenType.ADS);
  }

  @Get()
  async findAll(): Promise<AdToken[]> {
    return this.adTokenService.findAll();
  }
}
