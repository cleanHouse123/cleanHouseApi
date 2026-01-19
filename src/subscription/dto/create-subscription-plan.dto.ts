import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsArray,
  IsBoolean,
  IsOptional,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSubscriptionPlanDto {
  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @Type(() => Number)
  @IsNumber()
  priceInKopecks: number;

  @IsString()
  @IsNotEmpty()
  duration: string;

  @IsArray()
  @IsString({ each: true })
  features: string[];

  @IsString()
  @IsNotEmpty()
  icon: string;

  @IsString()
  @IsNotEmpty()
  badgeColor: string;

  @IsBoolean()
  @IsOptional()
  popular?: boolean;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  ordersLimit?: number;

  /**
   * Разрешено ли получать этот план бесплатно по реферальной программе
   */
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  isReferralFreeEnabled?: boolean;

  /**
   * Минимальное количество рефералов для бесплатного получения этого плана
   */
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(0)
  minReferralsForFree?: number;
}
