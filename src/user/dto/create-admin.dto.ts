import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class CreateAdminDto {
  @ApiProperty({
    description: 'Имя администратора',
    example: 'Иван Иванов',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Email администратора',
    example: 'admin@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Номер телефона администратора',
    example: '+7(999)123-45-67',
  })
  @IsString()
  phone: string;

  @ApiProperty({
    description: 'Пароль администратора',
    example: 'SecurePassword123!',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'Пароль должен содержать минимум 8 символов' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'Пароль должен содержать минимум одну строчную букву, одну заглавную букву и одну цифру',
  })
  password: string;
}
