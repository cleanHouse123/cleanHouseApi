import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from 'src/shared/types/user.role';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Пользователь не авторизован');
    }

    // Проверяем роль пользователя из базы данных
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Нет прав доступа. Требуются права администратора',
      );
    }

    return true;
  }
}