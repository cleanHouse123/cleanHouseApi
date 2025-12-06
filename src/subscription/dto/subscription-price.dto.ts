import { ApiProperty } from '@nestjs/swagger';

export class SubscriptionPriceDto {
  @ApiProperty({
    example: 100000,
    description: 'Базовая цена плана подписки в копейках',
  })
  basePrice: number;

  @ApiProperty({
    example: 0,
    description: 'Финальная цена с учетом скидок и бесплатных подписок в копейках',
  })
  finalPrice: number;

  @ApiProperty({
    example: false,
    description: 'Имеет ли пользователь право на бесплатную подписку',
  })
  isEligibleForFree: boolean;

  @ApiProperty({
    example: 3,
    description: 'Количество приглашенных пользователей',
    required: false,
  })
  referralCount?: number;

  @ApiProperty({
    example: 'Недостаточно приглашенных пользователей. Требуется: 3, текущее: 2',
    description: 'Причина, почему бесплатная подписка недоступна',
    required: false,
  })
  reason?: string;

  @ApiProperty({
    example: false,
    description: 'Использовал ли пользователь уже бесплатную подписку',
  })
  hasUsedFreeSubscription: boolean;
}

