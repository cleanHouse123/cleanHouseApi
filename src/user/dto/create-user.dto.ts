import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsArray } from 'class-validator';
import { UserRole } from 'src/shared/types/user.role';

export class CreateUserDto {
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

  @ApiProperty({ description: 'Имя пользователя' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Email пользователя', required: false })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({ description: 'Номер телефона', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ description: 'Хеш пароля' })
  @IsString()
  @IsOptional()
  hash_password?: string;

  @ApiProperty({ description: 'Верификация телефона', default: false })
  @IsOptional()
  isPhoneVerified?: boolean;

  @ApiProperty({ description: 'Верификация email', default: false })
  @IsOptional()
  isEmailVerified?: boolean;

  @ApiProperty({ description: 'Рекламный токен', required: false })
  @IsOptional()
  @IsString()
  adToken?: string;

  @ApiProperty({ description: 'Telegram ID пользователя', required: false })
  @IsOptional()
  @IsString()
  telegramId?: string;
}
