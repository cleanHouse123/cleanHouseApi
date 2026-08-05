import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class CreateCurrierDto {
  @ApiProperty({
    description: 'Имя курьера',
    example: 'Иван Иванов',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Email курьера',
    example: 'courier@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Номер телефона курьера',
    example: '+7(999)123-45-67',
  })
  @IsString()
  phone: string;
}
