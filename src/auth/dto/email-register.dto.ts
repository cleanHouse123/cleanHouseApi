import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class EmailRegisterDto {
  @ApiProperty({
    description: 'Email пользователя для регистрации',
    example: 'user@example.com',
    format: 'email',
    required: true,
  })
  @IsEmail({}, { message: 'Некорректный email' })
  @IsNotEmpty({ message: 'Email обязателен' })
  email: string;

  @ApiProperty({
    description: 'Пароль пользователя (минимум 6 символов)',
    example: 'MySecurePassword123',
    minLength: 6,
    type: 'string',
    format: 'password',
    required: true,
  })
  @IsString({ message: 'Пароль должен быть строкой' })
  @MinLength(6, { message: 'Пароль должен содержать минимум 6 символов' })
  @IsNotEmpty({ message: 'Пароль обязателен' })
  password: string;

  @ApiProperty({
    description: 'Полное имя пользователя',
    example: 'Иван Иванов',
    type: 'string',
    required: true,
  })
  @IsString({ message: 'Имя должно быть строкой' })
  @IsNotEmpty({ message: 'Имя обязательно' })
  name: string;
}
