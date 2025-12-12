import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsString, IsDateString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from '../entities/order.entity';

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class FindOrdersQueryDto {
  @ApiProperty({
    description: 'Номер страницы',
    required: false,
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({
    description: 'Количество элементов на странице',
    required: false,
    example: 10,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiProperty({
    description: 'Фильтр по статусу заказа',
    enum: OrderStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiProperty({
    description: 'Фильтр по ID клиента',
    required: false,
  })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({
    description: 'Фильтр по ID курьера',
    required: false,
  })
  @IsOptional()
  @IsString()
  currierId?: string;

  @ApiProperty({
    description: 'Начальная дата для фильтрации по scheduledAt (ISO 8601)',
    required: false,
    example: '2024-01-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  startScheduledAtDate?: string;

  @ApiProperty({
    description: 'Конечная дата для фильтрации по scheduledAt (ISO 8601)',
    required: false,
    example: '2024-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  endScheduledAtDate?: string;

  @ApiProperty({
    description: 'Порядок сортировки по scheduledAt',
    enum: SortOrder,
    required: false,
    default: SortOrder.ASC,
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder;
}
