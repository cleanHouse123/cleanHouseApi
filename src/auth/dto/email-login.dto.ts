import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class EmailLoginDto {
  @ApiProperty({
    description: 'Email пользователя для входа в систему',
    example: 'user@example.com',
    format: 'email',
    type: 'string',
    required: true,
  })
  @IsEmail({}, { message: 'Некорректный email' })
  @IsNotEmpty({ message: 'Email обязателен' })
  email: string;

  @ApiProperty({
    description: 'Пароль пользователя',
    example: 'MySecurePassword123',
    type: 'string',
    format: 'password',
    required: true,
  })
  @IsString({ message: 'Пароль должен быть строкой' })
  @IsNotEmpty({ message: 'Пароль обязателен' })
  password: string;
}
