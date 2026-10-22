import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
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

  @ApiPropertyOptional({
    description: 'Количество пакетов (для scope=order)',
    example: 2,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  numberPackages?: number;

  @ApiPropertyOptional({
    description: 'ID сохранённого адреса (для scope=order)',
  })
  @IsOptional()
  @IsUUID()
  addressId?: string;

  @ApiPropertyOptional({
    description: 'Адрес строкой, если он ещё не сохранён (для scope=order)',
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    description: 'Уточнения адреса: квартира, подъезд, этаж (для scope=order)',
  })
  @IsOptional()
  @IsObject()
  addressDetails?: Record<string, unknown>;
}
