import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import {
  SubscriptionType,
  SubscriptionStatus,
} from '../entities/subscription.entity';

export class UserResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiProperty()
  @Expose()
  phone: string;

  @Exclude()
  email?: string;

  @Exclude()
  hash_password?: string;

  @Exclude()
  refreshTokenHash?: string;
}

export class SubscriptionResponseDto {
  @ApiProperty({
    description: 'ID подписки',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @Expose()
  id: string;

  @ApiProperty({
    description: 'Пользователь',
    type: () => UserResponseDto,
  })
  @Expose()
  @Type(() => UserResponseDto)
  user: UserResponseDto;

  @ApiProperty({
    description: 'Тип подписки',
    enum: SubscriptionType,
    example: SubscriptionType.MONTHLY,
  })
  @Expose()
  type: SubscriptionType;

  @ApiProperty({
    description: 'Статус подписки',
    enum: SubscriptionStatus,
    example: SubscriptionStatus.ACTIVE,
  })
  @Expose()
  status: SubscriptionStatus;

  @ApiProperty({
    description: 'Цена подписки',
    example: 1500.0,
  })
  @Expose()
  price: number;

  @ApiProperty({
    description: 'Дата начала подписки',
    example: '2024-01-15T00:00:00Z',
  })
  @Expose()
  startDate: Date;

  @ApiProperty({
    description: 'Дата окончания подписки',
    example: '2024-02-15T00:00:00Z',
  })
  @Expose()
  endDate: Date;

  @ApiProperty({
    description: 'Дата отмены',
    example: '2024-01-20T10:00:00Z',
    required: false,
  })
  @Expose()
  canceledAt?: Date;

  @ApiProperty({
    description: 'Дата создания',
    example: '2024-01-15T10:00:00Z',
  })
  @Expose()
  createdAt: Date;

  @ApiProperty({
    description: 'Дата обновления',
    example: '2024-01-15T10:00:00Z',
  })
  @Expose()
  updatedAt: Date;

  @ApiProperty({
    description: 'Ссылка на оплату (если есть неоплаченный платеж)',
    example:
      'http://localhost:3000/payment/123e4567-e89b-12d3-a456-426614174000',
    required: false,
  })
  @Expose()
  paymentUrl?: string;
}
