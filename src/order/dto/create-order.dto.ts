import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsDateString,
  MaxLength,
  IsUUID,
  IsObject,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PaymentMethod } from '../entities/payment.entity';
import { IsOptionalEnum } from '../../shared/validators/optional-enum.validator';

export class CoordinatesDto {
  @ApiProperty({ description: 'Широта', example: '55.7558' })
  @IsString()
  geo_lat: string;

  @ApiProperty({ description: 'Долгота', example: '37.6176' })
  @IsString()
  geo_lon: string;
}

export class AddressDetailsDto {
  @ApiProperty({
    description: 'Номер дома/здания',
    example: 10,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  building?: number;

  @ApiProperty({ description: 'Корпус/блок', example: 'А', required: false })
  @IsOptional()
  @IsString()
  buildingBlock?: string;

  @ApiProperty({ description: 'Подъезд', example: '2', required: false })
  @IsOptional()
  @IsString()
  entrance?: string;

  @ApiProperty({ description: 'Этаж', example: 5, required: false })
  @IsOptional()
  @IsNumber()
  floor?: number;

  @ApiProperty({ description: 'Квартира/офис', example: 25, required: false })
  @IsOptional()
  @IsNumber()
  apartment?: number;
}

export class CreateOrderDto {
  @ApiProperty({
    description: 'ID клиента',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  customerId: string;

  @ApiProperty({
    description: 'Адрес для уборки',
    example: 'ул. Пушкина, д. 10, кв. 5',
  })
  @IsString()
  @MaxLength(500)
  address: string;

  @ApiProperty({
    description: 'Описание заказа',
    example: 'Уборка квартиры после ремонта',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({
    description: 'Запланированная дата и время',
    example: '2024-01-15T10:00:00Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

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
    description: 'Способ оплаты (не требуется если есть активная подписка)',
    enum: PaymentMethod,
    example: PaymentMethod.CARD,
    required: false,
  })
  @IsOptionalEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiProperty({
    description: 'Детали адреса',
    type: AddressDetailsDto,
    required: false,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AddressDetailsDto)
  addressDetails?: AddressDetailsDto;

  @ApiProperty({
    description: 'Координаты адреса',
    type: CoordinatesDto,
    required: false,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CoordinatesDto)
  coordinates?: CoordinatesDto;
}
