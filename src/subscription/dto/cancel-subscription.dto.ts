import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { RefundDecision } from '../../order/dto/cancel-with-refund.dto';

export class CancelSubscriptionDto {
  @ApiProperty({
    enum: RefundDecision,
    description:
      'Что делать с деньгами. full — сумма по формуле пункта 6.7 Оферты',
  })
  @IsEnum(RefundDecision)
  refund: RefundDecision;

  @ApiPropertyOptional({
    description:
      'Сумма возврата в рублях для частичного возврата: ею удерживают ' +
      'расходы по пункту 8.2 и стоимость использованных пакетов (6.2)',
    example: 450.5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @ApiPropertyOptional({
    description: 'Причина решения. Обязательна, когда возврат не делается',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
