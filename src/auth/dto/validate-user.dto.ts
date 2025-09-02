import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class ValidateInterviewerDto {
  @IsNotEmpty()
  @ApiProperty()
  email: string;

  @IsNotEmpty()
  @ApiProperty()
  name: string;
}

export class refreshTokenDto {
  @IsNotEmpty()
  @ApiProperty()
  refreshToken: string;
}
