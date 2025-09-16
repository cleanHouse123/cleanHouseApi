import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Пользователь не авторизован');
    }

    // Проверяем, является ли пользователь администратором
    // Здесь можно добавить проверку роли из базы данных
    // Пока используем простую проверку по ID или email
    const isAdmin = this.isUserAdmin(user);

    if (!isAdmin) {
      throw new ForbiddenException(
        'Нет прав доступа. Требуются права администратора',
      );
    }

    return true;
  }

  private isUserAdmin(user: any): boolean {
    // Здесь можно добавить более сложную логику проверки роли администратора
    // Например, проверку поля role в базе данных

    // Временная реализация - можно указать ID админов
    const adminIds = process.env.ADMIN_USER_IDS?.split(',') || [];
    const adminEmails = process.env.ADMIN_EMAILS?.split(',') || [
      'admin@cleanhouse.com',
    ];

    return adminIds.includes(user.id) || adminEmails.includes(user.email);
  }
}
