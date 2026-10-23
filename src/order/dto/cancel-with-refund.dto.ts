import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export enum RefundDecision {
  /** Вернуть всю оплаченную сумму */
  FULL = 'full',
  /** Вернуть часть: удержаны расходы, стоимость пакетов и т.п. */
  PARTIAL = 'partial',
  /** Не возвращать: вина заказчика, пункт 5.7 Оферты */
  NONE = 'none',
}

export class CancelWithRefundDto {
  @ApiProperty({
    enum: RefundDecision,
    description: 'Что делать с оплатой при отмене заказа',
  })
  @IsEnum(RefundDecision)
  refund: RefundDecision;

  @ApiPropertyOptional({
    description: 'Сумма возврата в рублях, обязательна для частичного возврата',
    example: 150.5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @ApiPropertyOptional({
    description:
      'Причина решения. Обязательна, когда возврат не делается, чтобы отказ можно было объяснить клиенту',
    example: 'Пакет не выставлен в точку передачи, пункт 5.7 Оферты',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
