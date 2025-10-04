import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  NotFoundException,
} from '@nestjs/common';
import { AdTokenService } from './ad-token.service';
import { AdToken } from './ad-token.entity';

@Controller('ad-tokens')
export class AdTokenController {
  constructor(private readonly adTokenService: AdTokenService) {}

  @Post()
  async create(@Body() body: { reference: string }): Promise<AdToken> {
    return this.adTokenService.create(body.reference);
  }

  @Get()
  async findAll(): Promise<AdToken[]> {
    return this.adTokenService.findAll();
  }
}
