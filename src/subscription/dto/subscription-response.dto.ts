import { ApiProperty } from '@nestjs/swagger';
import {
  SubscriptionType,
  SubscriptionStatus,
} from '../entities/subscription.entity';
import { User } from '../../user/entities/user.entity';

export class SubscriptionResponseDto {
  @ApiProperty({
    description: 'ID подписки',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Пользователь',
    type: () => User,
  })
  user: User;

  @ApiProperty({
    description: 'Тип подписки',
    enum: SubscriptionType,
    example: SubscriptionType.MONTHLY,
  })
  type: SubscriptionType;

  @ApiProperty({
    description: 'Статус подписки',
    enum: SubscriptionStatus,
    example: SubscriptionStatus.ACTIVE,
  })
  status: SubscriptionStatus;

  @ApiProperty({
    description: 'Цена подписки',
    example: 1500.0,
  })
  price: number;

  @ApiProperty({
    description: 'Дата начала подписки',
    example: '2024-01-15T00:00:00Z',
  })
  startDate: Date;

  @ApiProperty({
    description: 'Дата окончания подписки',
    example: '2024-02-15T00:00:00Z',
  })
  endDate: Date;

  @ApiProperty({
    description: 'Дата отмены',
    example: '2024-01-20T10:00:00Z',
    required: false,
  })
  canceledAt?: Date;

  @ApiProperty({
    description: 'Дата создания',
    example: '2024-01-15T10:00:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Дата обновления',
    example: '2024-01-15T10:00:00Z',
  })
  updatedAt: Date;
}
