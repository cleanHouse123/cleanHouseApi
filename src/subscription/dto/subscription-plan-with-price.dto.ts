import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionPlanResponseDto } from './subscription-plan-response.dto';

export class SubscriptionPlanWithPriceDto extends SubscriptionPlanResponseDto {
  @ApiProperty({
    example: 0,
    description: 'Финальная цена с учетом прав на бесплатную подписку в копейках',
  })
  finalPriceInKopecks: number;

  @ApiProperty({
    example: 0,
    description: 'Финальная цена с учетом прав на бесплатную подписку в рублях',
  })
  finalPriceInRubles: number;

  @ApiProperty({
    example: false,
    description: 'Имеет ли пользователь право на бесплатную подписку для этого плана',
  })
  isEligibleForFree: boolean;

  @ApiProperty({
    example: 3,
    description: 'Количество приглашенных пользователей',
    required: false,
  })
  referralCount?: number;

  @ApiProperty({
    example: false,
    description: 'Использовал ли пользователь уже бесплатную подписку',
  })
  hasUsedFreeSubscription: boolean;
}

