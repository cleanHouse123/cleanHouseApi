import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class TelegramVerifyCodeDto {
  @ApiProperty({
    description: 'Номер телефона в формате E.164 (например, +79123456789)',
    example: '+79123456789',
  })
  @IsString()
  phoneNumber: string;

  @ApiProperty({
    description: 'Код верификации',
    example: '123456',
    minLength: 4,
    maxLength: 8,
  })
  @IsString()
  @Length(4, 8)
  code: string;

  @ApiProperty({
    description: 'ID запроса от Telegram Gateway (если есть)',
    example: 'req_123456789',
    required: false,
  })
  @IsString()
  requestId?: string;
}
