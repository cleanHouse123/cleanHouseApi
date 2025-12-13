import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class AddDeviceTokenDto {
  @ApiProperty({
    description: 'FCM device token',
    example: 'fcm_token_here',
  })
  @IsString()
  @IsNotEmpty()
  token: string;
}
