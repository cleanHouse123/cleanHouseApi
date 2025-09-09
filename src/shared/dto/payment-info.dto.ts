import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class PaymentInfoDto {
  @ApiProperty({
    description: 'ID платежа',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @Expose()
  id: string;

  @ApiProperty({
    description: 'ID заказа или подписки',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @Expose()
  orderId?: string;

  @ApiProperty({
    description: 'ID подписки',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @Expose()
  subscriptionId?: string;

  @ApiProperty({
    description: 'Сумма платежа',
    example: 200.0,
  })
  @Expose()
  amount: number;

  @ApiProperty({
    description: 'Статус платежа',
    example: 'pending',
  })
  @Expose()
  status: string;

  @ApiProperty({
    description: 'Дата создания',
    example: '2024-01-15T10:00:00Z',
  })
  @Expose()
  createdAt: Date;

  @ApiProperty({
    description: 'Дата обновления',
    example: '2024-01-15T10:00:00Z',
    required: false,
  })
  @Expose()
  updatedAt?: Date;

  @ApiProperty({
    description: 'Дата оплаты',
    example: '2024-01-15T10:00:00Z',
    required: false,
  })
  @Expose()
  paidAt?: Date;
}
