import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsObject, IsOptional } from 'class-validator';
import { DaDataAddressDataNormalized } from '../interfaces/address-data.interface';

export class CreateUserAddressDto {
  @ApiProperty({ type: () => DaDataAddressDataNormalized })
  @IsObject()
  @IsNotEmpty()
  address: DaDataAddressDataNormalized;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isSupportableArea?: boolean;

  @ApiProperty({
    required: false,
    description: 'Дополнительные детали адреса (подъезд, этаж, квартира и т.п.)',
  })
  @IsOptional()
  addressDetails?: {
    building?: number;
    buildingBlock?: string;
    entrance?: string;
    floor?: number;
    apartment?: number;
    domophone?: string;
  };
}
