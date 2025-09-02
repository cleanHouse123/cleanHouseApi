import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { UserRole } from 'src/shared/types/user.role';

export class CreateUserDto {
  @ApiProperty({
    description: 'Роль пользователя',
    enum: UserRole,
    required: false,
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiProperty({ description: 'Имя пользователя' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Email пользователя', required: false })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({ description: 'Номер телефона' })
  @IsString()
  phone: string;

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
}
