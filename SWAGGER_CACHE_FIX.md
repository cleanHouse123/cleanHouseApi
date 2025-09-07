# Очистка кэша Swagger

Если в Swagger UI отображаются старые методы, которые уже удалены из кода:

## Решение:

1. **Перезапустите приложение:**

   ```bash
   pkill -f "nest start"
   yarn start:dev
   ```

2. **Очистите кэш браузера:**
   - Нажмите `Ctrl+Shift+R` (или `Cmd+Shift+R` на Mac)
   - Или откройте DevTools (F12) → вкладка Network → поставьте галочку "Disable cache"

3. **Проверьте Swagger:**
   - Откройте http://localhost:3000/api
   - Убедитесь, что старые методы исчезли

## Доступные методы AuthController:

- `POST /auth/sms/send` - Отправить SMS код
- `POST /auth/sms/verify` - Проверить SMS код
- `POST /auth/telegram/send` - Отправить Telegram код
- `POST /auth/telegram/verify` - Проверить Telegram код
- `POST /auth/telegram/check-ability` - Проверить возможность отправки
- `POST /auth/refresh` - Обновить токены
- `POST /auth/logout` - Выйти
- `POST /auth/validate-refresh` - Проверить refresh токен
- `GET /auth/me` - Получить информацию о пользователе

## Удаленные методы:

- ❌ `GET /auth/sms/balance` - удален
- ❌ `POST /auth/revoke-all-tokens` - удален
