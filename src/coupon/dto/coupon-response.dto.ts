import { ApiProperty } from '@nestjs/swagger';

export class CouponValidationResponseDto {
  @ApiProperty({ example: true })
  valid: true;

  @ApiProperty({ description: 'Базовая цена в копейках' })
  baseAmount: number;

  @ApiProperty({ description: 'Финальная цена с промокодом в копейках' })
  finalAmount: number;

  @ApiProperty({ description: 'Размер скидки в копейках' })
  discountAmount: number;

  @ApiProperty({
    description:
      'Цена без промокода в копейках, с учётом автоскидок. Если она меньше ' +
      'finalAmount, промокод клиенту невыгоден',
  })
  priceWithoutCoupon: number;
}
