import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsDateString,
  MaxLength,
  IsEnum,
  IsArray,
  IsNumber,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { ScheduleFrequency, ScheduledOrder } from '../entities/scheduled-order.entity';

export class CreateScheduledOrderDto {
  @ApiProperty({
    description: 'Адрес для уборки',
    example: 'ул. Пушкина, д. 10, кв. 5',
  })
  @IsString()
  @MaxLength(500)
  address: string;

  @ApiProperty({
    description: 'Описание заказа',
    example: 'Ежедневная уборка квартиры',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({
    description: 'Дополнительные заметки к заказу',
    example: 'Большие коробки',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({
    description: 'Частота создания заказов',
    enum: ScheduleFrequency,
    example: ScheduleFrequency.DAILY,
  })
  @IsEnum(ScheduleFrequency)
  frequency: ScheduleFrequency;

  @ApiProperty({
    description: 'Предпочтительное время создания заказа',
    example: '10:00',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Время должно быть в формате HH:MM',
  })
  preferredTime?: string;

  @ApiProperty({
    description: 'Дни недели для создания заказов (0 = воскресенье, 1 = понедельник)',
    example: [1, 2, 3, 4, 5],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[];

  @ApiProperty({
    description: 'Дата начала расписания',
    example: '2024-01-15T00:00:00Z',
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: 'Дата окончания расписания',
    example: '2024-12-31T23:59:59Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

// Используем Partial<ScheduledOrder> для упрощения кода
export type UpdateScheduledOrderDto = Partial<ScheduledOrder>;

export class ScheduledOrderResponseDto {
  @ApiProperty({
    description: 'ID расписания',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'ID клиента',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  customerId: string;

  @ApiProperty({
    description: 'Клиент',
    type: 'object',
    additionalProperties: true,
  })
  customer: any;

  @ApiProperty({
    description: 'Адрес для уборки',
    example: 'ул. Пушкина, д. 10, кв. 5',
  })
  address: string;

  @ApiProperty({
    description: 'Описание заказа',
    example: 'Ежедневная уборка квартиры',
  })
  description?: string;

  @ApiProperty({
    description: 'Дополнительные заметки к заказу',
    example: 'Большие коробки',
  })
  notes?: string;

  @ApiProperty({
    description: 'Частота создания заказов',
    enum: ScheduleFrequency,
    example: ScheduleFrequency.DAILY,
  })
  frequency: ScheduleFrequency;

  @ApiProperty({
    description: 'Предпочтительное время создания заказа',
    example: '10:00',
  })
  preferredTime?: string;

  @ApiProperty({
    description: 'Дни недели для создания заказов',
    example: [1, 2, 3, 4, 5],
  })
  daysOfWeek?: number[];

  @ApiProperty({
    description: 'Дата начала расписания',
    example: '2024-01-15T00:00:00Z',
  })
  startDate: Date;

  @ApiProperty({
    description: 'Дата окончания расписания',
    example: '2024-12-31T23:59:59Z',
  })
  endDate?: Date;

  @ApiProperty({
    description: 'Активно ли расписание',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Дата последнего создания заказа',
    example: '2024-01-15T10:00:00Z',
  })
  lastCreatedAt?: Date;

  @ApiProperty({
    description: 'Дата создания расписания',
    example: '2024-01-15T00:00:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Дата последнего обновления расписания',
    example: '2024-01-15T00:00:00Z',
  })
  updatedAt: Date;
}
