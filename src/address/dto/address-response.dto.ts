import { ApiProperty } from '@nestjs/swagger';

export class AddressResponseDto {
  @ApiProperty({ description: 'Краткий адрес' })
  value: string;

  @ApiProperty({ description: 'Полный адрес' })
  unrestricted_value: string;

  @ApiProperty({ description: 'Отображаемый адрес' })
  display: string;

  @ApiProperty({ description: 'Регион', nullable: true })
  region: string | null;

  @ApiProperty({ description: 'Регион с типом', nullable: true })
  region_with_type: string | null;

  @ApiProperty({ description: 'Район', nullable: true })
  area: string | null;

  @ApiProperty({ description: 'Район с типом', nullable: true })
  area_with_type: string | null;

  @ApiProperty({ description: 'Город', nullable: true })
  city: string | null;

  @ApiProperty({ description: 'Город с типом', nullable: true })
  city_with_type: string | null;

  @ApiProperty({ description: 'Населенный пункт', nullable: true })
  settlement: string | null;

  @ApiProperty({ description: 'Населенный пункт с типом', nullable: true })
  settlement_with_type: string | null;

  @ApiProperty({ description: 'Является ли микрорайоном' })
  is_microdistrict: boolean;

  @ApiProperty({ description: 'Город или населенный пункт', nullable: true })
  city_or_settlement: string | null;

  @ApiProperty({ description: 'Улица', nullable: true })
  street: string | null;

  @ApiProperty({ description: 'Улица с типом', nullable: true })
  street_with_type: string | null;

  @ApiProperty({ description: 'Дом', nullable: true })
  house: string | null;

  @ApiProperty({ description: 'Почтовый индекс', nullable: true })
  postal_code: string | null;

  @ApiProperty({ description: 'Широта', nullable: true })
  geo_lat: string | null;

  @ApiProperty({ description: 'Долгота', nullable: true })
  geo_lon: string | null;

  @ApiProperty({ description: 'ФИАС ID', nullable: true })
  fias_id: string | null;

  @ApiProperty({ description: 'Уровень ФИАС', nullable: true })
  fias_level: string | null;

  @ApiProperty({ description: 'КЛАДР ID', nullable: true })
  kladr_id: string | null;

  @ApiProperty({ description: 'ОКАТО', nullable: true })
  okato: string | null;

  @ApiProperty({ description: 'ОКТМО', nullable: true })
  oktmo: string | null;

  @ApiProperty({ description: 'Налоговая инспекция', nullable: true })
  tax_office: string | null;
}
