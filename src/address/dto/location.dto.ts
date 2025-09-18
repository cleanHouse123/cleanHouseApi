import { ApiProperty } from '@nestjs/swagger';

export class LocationDto {
  @ApiProperty({ description: 'Идентификатор', example: '1' })
  id: string;
  @ApiProperty({ description: 'Регион', example: '1' })
  region: string | null;
  @ApiProperty({ description: 'Район', example: '1' })
  area: string | null;
  @ApiProperty({ description: 'Город', example: '1' })
  city: string | null;
  @ApiProperty({ description: 'Населенный пункт', example: '1' })
  settlement: string | null;
  @ApiProperty({ description: 'Улица', example: '1' })
  street: string | null;
  @ApiProperty({
    description: 'Дата создания',
    example: '2024-01-15T10:30:00.000Z',
  })
  created_at: Date;
  @ApiProperty({
    description: 'Дата обновления',
    example: '2024-01-15T10:30:00.000Z',
  })
  updated_at: Date;
}


export class CreateLocationDto {
  @ApiProperty({ description: 'Регион', example: '1' })
  region: string | null;
  @ApiProperty({ description: 'Район', example: '1' })
  area: string | null;
  @ApiProperty({ description: 'Город', example: '1' })
  city: string | null;
  @ApiProperty({ description: 'Населенный пункт', example: '1' })
  settlement: string | null;
}