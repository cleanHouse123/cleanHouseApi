import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';

// Обновление только публичных полей (name, email, phone)
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, [
    'adToken',
    'role',
    'hash_password',
    'isPhoneVerified',
    'isEmailVerified',
  ] as const),
) {}
