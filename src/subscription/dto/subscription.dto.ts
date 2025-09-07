import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsDateString,
  Min,
  IsUUID,
} from 'class-validator';
import { SubscriptionType } from '../entities/subscription.entity';

export class CreateSubscriptionDto {
  @ApiProperty({
    description: 'ID пользователя',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  userId: string;

  @ApiProperty({
    description: 'Тип подписки',
    enum: SubscriptionType,
    example: SubscriptionType.MONTHLY,
  })
  @IsEnum(SubscriptionType)
  type: SubscriptionType;

  @ApiProperty({
    description: 'Цена подписки',
    example: 1500.0,
    minimum: 0,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiProperty({
    description: 'Дата начала подписки',
    example: '2024-01-15T00:00:00Z',
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: 'Дата окончания подписки',
    example: '2024-02-15T00:00:00Z',
  })
  @IsDateString()
  endDate: string;
}

export class UpdateSubscriptionStatusDto {
  @ApiProperty({
    description: 'Новый статус подписки',
    enum: ['active', 'expired', 'canceled'],
    example: 'canceled',
  })
  @IsEnum(['active', 'expired', 'canceled'])
  status: 'active' | 'expired' | 'canceled';

  @ApiProperty({
    description: 'Дата отмены (если статус canceled)',
    example: '2024-01-20T10:00:00Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  canceledAt?: string;
}
