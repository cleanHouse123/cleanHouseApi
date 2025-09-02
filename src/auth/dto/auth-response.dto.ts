import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT access token' })
  accessToken: string;

  @ApiProperty({ description: 'JWT refresh token' })
  refreshToken: string;

  @ApiProperty({ description: 'Данные пользователя' })
  user: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    role: string;
  };
}
