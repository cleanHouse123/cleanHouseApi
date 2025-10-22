import { IsString, IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendSmsDto {
  @ApiProperty({ example: '+375333348546', description: 'Номер телефона' })
  @IsString()
  phoneNumber: string;

  @ApiProperty({
    example: false,
    description:
      'Режим разработки - если true, то SMS не отправляется, а возвращается моковый код',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isDev?: boolean;

  @ApiProperty({
    example: 'auto',
    description: 'Канал отправки: auto (WhatsApp с fallback на SMS), whatsapp, sms',
    enum: ['auto', 'whatsapp', 'sms'],
    required: false,
  })
  @IsOptional()
  @IsEnum(['auto', 'whatsapp', 'sms'])
  channel?: 'auto' | 'whatsapp' | 'sms';
}
