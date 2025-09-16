import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateCurrierDto {
  @ApiProperty({ 
    description: 'Имя администратора',
    example: 'Иван Иванов'
  })
  @IsString()
  name: string;

  @ApiProperty({ 
    description: 'Номер телефона администратора',
    example: '+7(999)123-45-67'
  })
  @IsString()
  phone: string;
}
