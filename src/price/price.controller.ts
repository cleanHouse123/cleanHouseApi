import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { PriceService } from './price.service';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

@Controller('price')
export class PriceController {
  constructor(private readonly priceService: PriceService) {}

  @Get('order')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT')
  async getOrderPrice(@Request() req) {
    const userId = req.user?.userId || req.user?.id;
    const price = await this.priceService.getOrderPrice(userId);
    return {
      priceInKopecks: price,
      priceInRubles: price / 100,
      currency: 'RUB'
    };
  }
}
