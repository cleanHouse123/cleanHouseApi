import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { CouponScope } from '../entities/coupon.entity';

export class ValidateCouponDto {
  @ApiProperty({ example: 'KVARTAL1' })
  @IsString()
  code: string;

  @ApiProperty({ enum: CouponScope })
  @IsEnum(CouponScope)
  scope: CouponScope;

  @ApiPropertyOptional({
    description: 'ID плана подписки (для scope=subscription)',
  })
  @IsOptional()
  @IsUUID()
  planId?: string;
}
