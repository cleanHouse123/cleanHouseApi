import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsArray,
  IsEnum,
  IsString,
  MinLength,
  Matches,
} from 'class-validator';
import { UserRole } from 'src/shared/types/user.role';

export class UpdateUserDto {
  @ApiProperty({ description: 'Имя пользователя', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Email пользователя', required: false })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({ description: 'Номер телефона', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    description: 'Username пользователя в Telegram',
    required: false,
  })
  @IsOptional()
  @IsString()
  telegramUsername?: string;

  @ApiProperty({
    description: 'Роли пользователя',
    enum: UserRole,
    isArray: true,
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(UserRole, { each: true })
  roles?: UserRole[];

  @ApiProperty({
    description: 'Новый пароль пользователя',
    required: false,
    minLength: 8,
  })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Пароль должен содержать минимум 8 символов' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'Пароль должен содержать минимум одну строчную букву, одну заглавную букву и одну цифру',
  })
  password?: string;
}
