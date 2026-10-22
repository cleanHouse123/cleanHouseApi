import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class SaveConsentsDto {
  @ApiProperty({
    description: 'Приняты условия оферты и пользовательского соглашения',
    example: true,
  })
  @IsBoolean()
  terms: boolean;

  @ApiProperty({
    description: 'Дано согласие на обработку персональных данных',
    example: true,
  })
  @IsBoolean()
  personalData: boolean;

  @ApiProperty({
    description:
      'Дано согласие на рекламную рассылку. false отзывает ранее данное согласие',
    example: false,
  })
  @IsBoolean()
  marketing: boolean;

  @ApiProperty({
    description: 'Редакция документов, с которой согласился пользователь',
    example: '22 октября 2026 г.',
    required: false,
  })
  @IsOptional()
  @IsString()
  revision?: string;
}
