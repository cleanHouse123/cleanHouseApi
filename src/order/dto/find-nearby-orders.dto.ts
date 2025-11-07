import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from '../entities/order.entity';

export class FindNearbyOrdersDto {
  @ApiProperty({
    description: 'Широта местоположения пользователя',
    example: 55.7558,
  })
  @IsNumber()
  @Type(() => Number)
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({
    description: 'Долгота местоположения пользователя',
    example: 37.6176,
  })
  @IsNumber()
  @Type(() => Number)
  @Min(-180)
  @Max(180)
  lon: number;

  @ApiProperty({
    description: 'Максимальное расстояние в метрах',
    example: 5000,
    required: false,
    default: 10000,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  maxDistance?: number = 10000;

  @ApiProperty({
    description: 'Номер страницы',
    example: 1,
    required: false,
    default: 1,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    description: 'Количество на странице',
    example: 10,
    required: false,
    default: 10,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  limit?: number = 10;

  @ApiProperty({
    description: 'Фильтр по статусу',
    enum: OrderStatus,
    required: false,
  })
  @IsOptional()
  status?: OrderStatus;
}

