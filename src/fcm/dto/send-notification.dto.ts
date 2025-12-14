import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class SendNotificationDto {
  @ApiProperty({
    description: 'FCM device token',
    example: 'dLFLErWcQCaBp40UquZYJL:APA91bE...',
  })
  @IsString()
  @IsNotEmpty()
  deviceToken: string;

  @ApiProperty({
    description: 'Заголовок уведомления',
    example: 'Новое уведомление',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'Текст уведомления',
    example: 'Это тестовое уведомление',
  })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiProperty({
    description: 'Дополнительные данные (payload) в формате JSON string',
    example: '{"orderId": "123", "type": "test"}',
    required: false,
  })
  @IsString()
  @IsOptional()
  payload?: string;
}


