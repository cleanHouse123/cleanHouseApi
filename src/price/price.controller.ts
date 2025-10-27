import { Controller, Get } from '@nestjs/common';
import { PriceService } from './price.service';

@Controller('price')
export class PriceController {
  constructor(private readonly priceService: PriceService) {}

  @Get('order')
  async getOrderPrice() {
    const price = await this.priceService.getOrderPrice();
    return {
      priceInKopecks: price,
      priceInRubles: price / 100,
      currency: 'RUB'
    };
  }
}
