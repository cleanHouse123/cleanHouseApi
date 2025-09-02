import { IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifySmsDto {
  @ApiProperty({ example: '+375333348546', description: 'Номер телефона' })
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'Неверный формат номера телефона' })
  phoneNumber: string;

  @ApiProperty({ example: '4343', description: 'Код верификации' })
  @IsString()
  @Length(6, 6)
  code: string;
}
