import { Controller, Get, Request, UseGuards, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PriceService } from './price.service';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

@Controller('price')
export class PriceController {
  constructor(private readonly priceService: PriceService) {}

  @Get('order')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiQuery({ name: 'numberPackages', required: false, type: Number, description: 'Количество пакетов' })
  async getOrderPrice(@Request() req, @Query('numberPackages') numberPackages?: number) {
    const userId = req.user?.userId || req.user?.id;
    const packagesCount = numberPackages ? Number(numberPackages) : 1;
    const price = await this.priceService.getOrderPrice(userId, packagesCount);
    return {
      priceInKopecks: price,
      priceInRubles: price / 100,
      currency: 'RUB'
    };
  }
}
