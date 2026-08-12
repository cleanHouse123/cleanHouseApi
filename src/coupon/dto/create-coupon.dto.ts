import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { CouponScope, CouponDiscountType } from '../entities/coupon.entity';

export class CreateCouponDto {
  @ApiProperty({ example: 'KVARTAL1' })
  @IsString()
  @MaxLength(64)
  code: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: CouponScope })
  @IsEnum(CouponScope)
  scope: CouponScope;

  @ApiProperty({ enum: CouponDiscountType })
  @IsEnum(CouponDiscountType)
  discountType: CouponDiscountType;

  @ApiProperty({ description: 'percent 1..100 или копейки' })
  @IsInt()
  @Min(0)
  value: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxRedemptions?: number;

  @ApiPropertyOptional({ description: 'Минимальная сумма покупки в копейках' })
  @IsOptional()
  @IsInt()
  @Min(0)
  minAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  subscriptionPlanId?: string;
}
