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

  private transformDates(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (obj instanceof Date) {
      // Создаем новую дату в московском времени
      const moscowDate = new Date(
        obj.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }),
      );
      return moscowDate.toISOString();
    }

    // Обрабатываем строки дат (ISO формат)
    if (typeof obj === 'string' && this.isISODateString(obj)) {
      const date = new Date(obj);
      const moscowDate = new Date(
        date.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }),
      );
      return moscowDate.toISOString();
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.transformDates(item));
    }

    if (typeof obj === 'object') {
      const transformed: any = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          transformed[key] = this.transformDates(obj[key]);
        }
      }
      return transformed;
    }

    return obj;
  }

  private isISODateString(str: string): boolean {
    // Проверяем, является ли строка ISO датой
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/.test(str);
  }
}
