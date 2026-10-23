import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { OrderStatus } from '../entities/order.entity';

export class UpdateOrderStatusDto {
  @ApiProperty({
    description: 'Новый статус заказа',
    enum: OrderStatus,
    example: OrderStatus.ASSIGNED,
  })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ApiProperty({
    description: 'ID курьера (требуется для статуса assigned)',
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  currierId?: string;

  @ApiProperty({
    description:
      'Вернуть вынос в подписку вопреки сроку отмены. По умолчанию решает ' +
      'правило: отмена менее чем за 3 часа до выноса его списывает',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  returnPickup?: boolean;
}
