import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsArray,
  IsBoolean,
  IsOptional,
} from 'class-validator';

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
}
