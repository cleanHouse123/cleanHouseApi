import { IsString, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TelegramLoginWidgetDto {
  @ApiProperty({
    example: 123456789,
    description: 'Telegram ID пользователя',
  })
  @IsNumber()
  id: number;

  @ApiProperty({
    example: 'Иван',
    description: 'Имя пользователя',
    required: false,
  })
  @IsOptional()
  @IsString()
  first_name?: string;

  @ApiProperty({
    example: 'Иванов',
    description: 'Фамилия пользователя',
    required: false,
  })
  @IsOptional()
  @IsString()
  last_name?: string;

  @ApiProperty({
    example: 'ivan_ivanov',
    description: 'Username пользователя в Telegram',
    required: false,
  })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({
    example: 'https://t.me/i/userpic/320/username.jpg',
    description: 'URL фотографии пользователя',
    required: false,
  })
  @IsOptional()
  @IsString()
  photo_url?: string;

  @ApiProperty({
    example: 1234567890,
    description: 'Unix timestamp времени авторизации',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  auth_date?: number;

  @ApiProperty({
    example: 'abc123def456...',
    description: 'HMAC-SHA-256 hash для проверки подлинности данных',
    required: false,
  })
  @IsOptional()
  @IsString()
  hash?: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Рекламный токен для привязки пользователя',
    required: false,
  })
  @IsOptional()
  @IsString()
  adToken?: string;
}
