import { IsString, IsOptional, IsBoolean } from 'class-validator';
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
}
