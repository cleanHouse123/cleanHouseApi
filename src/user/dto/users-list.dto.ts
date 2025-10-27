import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from 'src/shared/types/user.role';

export class UsersListDto {

  @ApiProperty({
    description: 'ID администратора',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Роль пользователя',
    enum: UserRole,
  })
  role: UserRole;

  @ApiProperty({
    description: 'Имя администратора',
    example: 'Иван Иванов',
  })
  name: string;

  @ApiProperty({
    description: 'Email администратора',
    example: 'admin@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'Номер телефона администратора',
    example: '+7 (999) 123-45-67',
  })
  phone: string;

  @ApiProperty({
    description: 'Статус верификации телефона',
    example: false,
  })
  isPhoneVerified: boolean;

  @ApiProperty({
    description: 'Статус верификации email',
    example: false,
  })
  isEmailVerified: boolean;

  @ApiProperty({
    description: 'Дата создания',
    example: '2024-01-15T10:30:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Дата последнего обновления',
    example: '2024-01-15T10:30:00.000Z',
  })
  updatedAt: Date;
}
