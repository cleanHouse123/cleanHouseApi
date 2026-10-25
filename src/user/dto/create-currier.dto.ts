import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

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

  /**
   * Курьер заходит в мобильное приложение по почте и паролю, а сам
   * зарегистрироваться не может: без пароля создавалась учётная запись, в
   * которую невозможно войти. Требования те же, что к администратору.
   */
  @ApiProperty({
    description: 'Пароль курьера для входа в мобильное приложение',
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
