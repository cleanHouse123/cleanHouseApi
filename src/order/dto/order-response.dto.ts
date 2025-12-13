import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import { OrderStatus } from '../entities/order.entity';
import { PaymentStatus, PaymentMethod } from '../entities/payment.entity';

export class PaymentResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  amount: number;

  @ApiProperty({ enum: PaymentStatus })
  @Expose()
  status: PaymentStatus;

  @ApiProperty({ enum: PaymentMethod })
  @Expose()
  method: PaymentMethod;

  @ApiProperty()
  @Expose()
  createdAt: Date;
}

export class UserResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiProperty()
  @Expose()
  phone: string;

  @Exclude()
  email?: string;

  @Exclude()
  hash_password?: string;

  @Exclude()
  refreshTokenHash?: string;
}

export class OrderResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty({ type: UserResponseDto })
  @Expose()
  @Type(() => UserResponseDto)
  customer: UserResponseDto;

  @ApiProperty({ type: UserResponseDto, required: false })
  @Expose()
  @Type(() => UserResponseDto)
  currier?: UserResponseDto | null;

  @ApiProperty()
  @Expose()
  address: string;

  @ApiProperty({
    required: false,
    description: 'Детали адреса',
    example: {
      building: 10,
      buildingBlock: 'А',
      entrance: '2',
      floor: 5,
      apartment: 25,
      domophone: '123#45',
    },
  })
  @Expose()
  addressDetails?: {
    building?: number;
    buildingBlock?: string;
    entrance?: string;
    floor?: number;
    apartment?: number;
    domophone?: string;
  };

  @ApiProperty({ required: false })
  @Expose()
  description?: string;

  @ApiProperty()
  @Expose()
  price: number;

  @ApiProperty({ enum: OrderStatus })
  @Expose()
  status: OrderStatus;

  @ApiProperty({ required: false })
  @Expose()
  scheduledAt?: Date | null;

  @ApiProperty({ required: false })
  @Expose()
  notes?: string;

  @ApiProperty({ required: false, description: 'Ссылка на оплату заказа' })
  @Expose()
  paymentUrl?: string;

  @ApiProperty({
    required: false,
    description: 'Координаты адреса',
    example: { lat: 55.7558, lon: 37.6176 },
  })
  @Expose()
  coordinates?: { lat: number; lon: number };

  @ApiProperty({
    description: 'Количество пакетов',
    example: 1,
    default: 1,
  })
  @Expose()
  numberPackages: number;

  @ApiProperty({ type: [PaymentResponseDto] })
  @Expose()
  @Type(() => PaymentResponseDto)
  payments: PaymentResponseDto[];

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;
}
