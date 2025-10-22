import { IsString, Length, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifySmsDto {
  @ApiProperty({ example: '+375333348546', description: 'Номер телефона' })
  @IsString()
  phoneNumber: string;

  @ApiProperty({ example: '4343', description: 'Код верификации' })
  @IsString()
  @Length(6, 6)
  code: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Рекламный токен для привязки пользователя',
    required: false,
  })
  @IsOptional()
  @IsString()
  adToken?: string;
}
