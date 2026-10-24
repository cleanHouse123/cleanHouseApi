import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { MAX_FREEZE_DAYS } from '../subscription-freeze';

export class FreezeSubscriptionDto {
  @ApiProperty({
    description: `На сколько дней приостановить подписку, не более ${MAX_FREEZE_DAYS} за период (пункт 6.4 Оферты)`,
    example: 7,
    minimum: 1,
    maximum: MAX_FREEZE_DAYS,
  })
  @IsInt()
  @Min(1)
  @Max(MAX_FREEZE_DAYS)
  days: number;
}
