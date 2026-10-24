import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Поля, которым нельзя покидать сервер ни в одном ответе: хеш пароля, хеш
 * refresh-токена и push-токен устройства.
 */
export const SECRET_FIELDS = [
  'hash_password',
  'refreshTokenHash',
  'deviceToken',
] as const;

/** Глубже вложенности ответов не бывает, а от циклов это защищает */
const MAX_DEPTH = 12;

/**
 * Убирает секреты из тела ответа.
 *
 * Ответы собираются обычными объектами, а не экземплярами DTO, поэтому
 * `@Exclude()` на полях DTO ничего не делал: заказ возвращал клиенту всю
 * запись пользователя вместе с `hash_password` и `refreshTokenHash`. Чистить
 * каждый ответ по отдельности ненадёжно — связанные сущности попадают в
 * ответы из десятков мест, — поэтому срезаем в одном месте на выходе.
 */
export const stripSecrets = <T>(value: T, depth = 0): T => {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date || Buffer.isBuffer(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => {
      stripSecrets(item, depth + 1);
    });

    return value;
  }

  const record = value as Record<string, unknown>;

  for (const field of SECRET_FIELDS) {
    if (field in record) {
      delete record[field];
    }
  }

  for (const key of Object.keys(record)) {
    stripSecrets(record[key], depth + 1);
  }

  return value;
};

@Injectable()
export class StripSecretsInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(map((body: unknown) => stripSecrets(body)));
  }
}
