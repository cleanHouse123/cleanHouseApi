import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // Переопределяем canActivate, чтобы всегда разрешать доступ
  // но при этом пытаться аутентифицировать пользователя, если токен есть
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      // Пытаемся аутентифицировать, но не выбрасываем ошибку при отсутствии токена
      const result = super.canActivate(context);
      if (result instanceof Promise) {
        return await result;
      }
      return result as boolean;
    } catch (error) {
      // Если токена нет или он невалидный, просто разрешаем доступ без пользователя
      return true;
    }
  }

  // Переопределяем handleRequest, чтобы не выбрасывать ошибку при отсутствии токена
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    // Если токена нет или он невалидный, просто возвращаем undefined вместо ошибки
    if (err || !user) {
      return undefined;
    }
    return user;
  }
}

