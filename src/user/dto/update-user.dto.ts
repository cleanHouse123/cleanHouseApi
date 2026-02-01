import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsArray, IsEnum, IsString } from 'class-validator';
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

  @ApiProperty({ description: 'Username пользователя в Telegram', required: false })
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
}
