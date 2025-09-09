import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class TimezoneInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        return this.transformDates(data);
      }),
    );
  }

  private transformDates(obj: any, visited = new WeakSet()): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    // Обрабатываем ошибки
    if (obj instanceof Error) {
      return {
        name: obj.name,
        message: obj.message,
        stack: obj.stack,
      };
    }

    // Пропускаем примитивные типы
    if (typeof obj !== 'object') {
      // Обрабатываем строки дат (ISO формат)
      if (typeof obj === 'string' && this.isISODateString(obj)) {
        const date = new Date(obj);
        const moscowDate = new Date(
          date.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }),
        );
        return moscowDate.toISOString();
      }
      return obj;
    }

    // Предотвращаем циклические ссылки
    if (visited.has(obj)) {
      return '[Circular]';
    }

    // Пропускаем специальные объекты
    if (obj instanceof Date) {
      const moscowDate = new Date(
        obj.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }),
      );
      return moscowDate.toISOString();
    }

    // Пропускаем функции, Buffer, и другие специальные объекты
    if (
      typeof obj === 'function' ||
      Buffer.isBuffer(obj) ||
      obj.constructor?.name === 'Socket' ||
      obj.constructor?.name === 'Server' ||
      obj.constructor?.name === 'EventEmitter' ||
      obj.constructor?.name === 'WebSocket' ||
      obj.constructor?.name === 'WebSocketServer' ||
      obj.constructor?.name === 'Map' ||
      obj.constructor?.name === 'Set' ||
      obj.constructor?.name === 'WeakMap' ||
      obj.constructor?.name === 'WeakSet' ||
      obj.constructor?.name === 'Promise' ||
      obj.constructor?.name === 'Generator' ||
      obj.constructor?.name === 'AsyncGenerator'
    ) {
      return obj;
    }

    visited.add(obj);

    if (Array.isArray(obj)) {
      return obj.map((item) => {
        try {
          return this.transformDates(item, visited);
        } catch (error) {
          console.warn(`Failed to serialize array item:`, error.message);
          return '[Non-serializable]';
        }
      });
    }

    const transformed: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        try {
          transformed[key] = this.transformDates(obj[key], visited);
        } catch (error) {
          // Если не можем сериализовать свойство, пропускаем его
          console.warn(`Failed to serialize property ${key}:`, error.message);
          transformed[key] = '[Non-serializable]';
        }
      }
    }
    return transformed;
  }

  private isISODateString(str: string): boolean {
    // Проверяем, является ли строка ISO датой
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/.test(str);
  }
}
