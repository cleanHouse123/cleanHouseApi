import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, Min, Max, Length } from 'class-validator';

export class TelegramSendCodeDto {
  @ApiProperty({
    description: 'Номер телефона в формате E.164 (например, +79123456789)',
    example: '+79123456789',
  })
  @IsString()
  phoneNumber: string;

  @ApiProperty({
    description: 'Длина кода верификации (4-8 символов)',
    example: 6,
    required: false,
    minimum: 4,
    maximum: 8,
  })
  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(8)
  codeLength?: number;

  @ApiProperty({
    description: 'Пользовательский код верификации (4-8 цифр)',
    example: '123456',
    required: false,
    minLength: 4,
    maxLength: 8,
  })
  @IsOptional()
  @IsString()
  @Length(4, 8)
  code?: string;

  @ApiProperty({
    description: 'URL для получения отчетов о доставке',
    example: 'https://your-domain.com/webhook/telegram-delivery',
    required: false,
  })
  @IsOptional()
  @IsString()
  callbackUrl?: string;

  @ApiProperty({
    description: 'Время жизни сообщения в секундах (30-3600)',
    example: 300,
    required: false,
    minimum: 30,
    maximum: 3600,
  })
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(3600)
  ttl?: number;
}
