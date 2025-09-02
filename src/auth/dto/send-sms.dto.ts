import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendSmsDto {
  @ApiProperty({ example: '+375333348546', description: 'Номер телефона' })
  @IsString()
  phoneNumber: string;
}
