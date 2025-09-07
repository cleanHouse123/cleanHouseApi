# Структура API - AuthController

## 📋 Организация по тегам в Swagger

### 🔐 Email Authentication

- `POST /auth/email/register` - Регистрация через email/password
- `POST /auth/email/login` - Авторизация через email/password

### 📱 SMS Authentication (Mock)

- `POST /auth/sms/send` - Отправить SMS с кодом верификации
- `POST /auth/sms/verify` - Проверить SMS код и авторизоваться
- `GET /auth/sms/verification-code/:phone` - Получить код верификации (тестирование)
- `POST /auth/sms/cleanup` - Очистить истекшие коды верификации

### 📲 Telegram Authentication

- `POST /auth/telegram/send` - Отправить код через Telegram Gateway
- `POST /auth/telegram/verify` - Проверить Telegram код и авторизоваться
- `POST /auth/telegram/check-ability` - Проверить возможность отправки

### 🔑 Token Management

- `POST /auth/refresh` - Обновить access token
- `POST /auth/logout` - Выход из системы
- `POST /auth/validate-refresh` - Проверить валидность refresh token

### 👤 User Profile

- `GET /auth/me` - Получить данные текущего пользователя

## 🎯 Преимущества новой структуры

1. **Четкое разделение** - каждый тип авторизации в своем разделе
2. **Удобная навигация** - легко найти нужный метод
3. **Логическая группировка** - связанные методы рядом
4. **Отсутствие дублирования** - каждый метод только один раз

## 🔧 Исправленные проблемы

- ❌ Удалены дублирующиеся методы Telegram Authentication
- ❌ Убраны устаревшие методы (getBalance, revokeAllTokens)
- ✅ Добавлены разделители между группами методов
- ✅ Структурированы теги для лучшей навигации
