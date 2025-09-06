# Clean House API

API для сервиса уборки домов с поддержкой авторизации через SMS и Telegram Gateway.

## Особенности

- 🔐 Авторизация через SMS (SMS.RU)
- 📱 Авторизация через Telegram Gateway API
- 🚀 NestJS + TypeORM + PostgreSQL
- 📚 Swagger документация
- 🐳 Docker поддержка

## Установка и запуск

### Предварительные требования

- Node.js 18+
- PostgreSQL 12+
- Docker (опционально)

### Локальная разработка

1. **Клонирование репозитория**

```bash
git clone <repository-url>
cd cleanHouseApi
```

2. **Установка зависимостей**

```bash
yarn install
```

3. **Настройка переменных окружения**

Создайте файл `.env.development`:

```env
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5489
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=cleanhouse_dev

# JWT
JWT_SECRET=your-super-secret-jwt-key-for-development
JWT_REFRESH_SECRET=your-super-secret-refresh-jwt-key-for-development
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# SMS Service (SMS.RU)
SMS_API_ID=your-sms-api-id
SMS_LOGIN=your-sms-login
SMS_PASSWORD=your-sms-password

# Telegram Gateway API
TELEGRAM_GATEWAY_TOKEN=your-telegram-gateway-token

# App
PORT=3000
NODE_ENV=development
```

4. **Запуск базы данных через Docker**

```bash
yarn docker:dev
```

5. **Запуск приложения**

```bash
yarn start:dev
```

Приложение будет доступно по адресу: http://localhost:3000
Swagger документация: http://localhost:3000/api

## Настройка Telegram Gateway API

### 1. Получение токена доступа

1. Перейдите на [Telegram Gateway](https://core.telegram.org/gateway)
2. Создайте аккаунт разработчика
3. Получите токен доступа в настройках аккаунта
4. Добавьте токен в переменную `TELEGRAM_GATEWAY_TOKEN`

### 2. Преимущества Telegram Gateway

- **Экономия**: $0.01 за код (в 50 раз дешевле SMS)
- **Надежность**: Мгновенная доставка через Telegram
- **Безопасность**: Шифрование и защита от SIM-своп атак
- **Охват**: 950+ миллионов пользователей Telegram

### 3. Тестирование

Для тестирования отправляйте коды на свой номер телефона - это бесплатно.

## API Эндпоинты

### Telegram авторизация

#### Отправить код верификации

```http
POST /auth/telegram/send
Content-Type: application/json

{
  "phoneNumber": "+79123456789",
  "codeLength": 6,
  "ttl": 300
}
```

#### Проверить код и авторизоваться

```http
POST /auth/telegram/verify
Content-Type: application/json

{
  "phoneNumber": "+79123456789",
  "code": "123456",
  "requestId": "req_123456789"
}
```

#### Проверить возможность отправки

```http
POST /auth/telegram/check-ability
Content-Type: application/json

{
  "phoneNumber": "+79123456789"
}
```

### SMS авторизация

#### Отправить SMS код

```http
POST /auth/sms/send
Content-Type: application/json

{
  "phoneNumber": "+79123456789"
}
```

#### Проверить SMS код

```http
POST /auth/sms/verify
Content-Type: application/json

{
  "phoneNumber": "+79123456789",
  "code": "123456"
}
```

## Настройка фронтенда

### React/Next.js пример

```typescript
// services/auth.ts
class AuthService {
  private baseUrl = 'http://localhost:3000';

  async sendTelegramCode(phoneNumber: string) {
    const response = await fetch(`${this.baseUrl}/auth/telegram/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumber,
        codeLength: 6,
        ttl: 300,
      }),
    });
    return response.json();
  }

  async verifyTelegramCode(
    phoneNumber: string,
    code: string,
    requestId?: string,
  ) {
    const response = await fetch(`${this.baseUrl}/auth/telegram/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumber,
        code,
        requestId,
      }),
    });
    return response.json();
  }
}
```

### React компонент

```tsx
import React, { useState } from 'react';

const TelegramAuth: React.FC = () => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [requestId, setRequestId] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');

  const handleSendCode = async () => {
    try {
      const result = await authService.sendTelegramCode(phoneNumber);
      if (result.success) {
        setRequestId(result.requestId);
        setStep('code');
        alert(`Код отправлен! Стоимость: $${result.cost}`);
      } else {
        alert(`Ошибка: ${result.message}`);
      }
    } catch (error) {
      alert('Ошибка отправки кода');
    }
  };

  const handleVerifyCode = async () => {
    try {
      const result = await authService.verifyTelegramCode(
        phoneNumber,
        code,
        requestId,
      );
      if (result.accessToken) {
        localStorage.setItem('accessToken', result.accessToken);
        localStorage.setItem('refreshToken', result.refreshToken);
        alert('Авторизация успешна!');
      } else {
        alert('Неверный код');
      }
    } catch (error) {
      alert('Ошибка авторизации');
    }
  };

  return (
    <div>
      {step === 'phone' ? (
        <div>
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+79123456789"
          />
          <button onClick={handleSendCode}>Отправить код</button>
        </div>
      ) : (
        <div>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
          />
          <button onClick={handleVerifyCode}>Проверить код</button>
        </div>
      )}
    </div>
  );
};
```

## Docker

### Запуск в Docker

```bash
# Разработка
yarn docker:dev

# Продакшн
yarn docker:prod
```

### Структура Docker

- `dev-app`: Приложение для разработки с hot reload
- `dev-db`: PostgreSQL база данных
- `app`: Продакшн приложение
- `db`: Продакшн база данных

## Мониторинг и логи

- Swagger UI: http://localhost:3000/api
- Health Check: http://localhost:3000/health
- Логи приложения доступны через Docker Compose

## Безопасность

- JWT токены с коротким временем жизни
- Refresh токены для обновления сессий
- Валидация входных данных
- Защита от брутфорса
- Шифрование паролей с bcrypt

## Поддержка

Для вопросов и поддержки создайте issue в репозитории.

<p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
<a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
<a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
<a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>

</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ yarn install
```

## Compile and run the project

```bash
# development
$ yarn run start

# watch mode
$ yarn run start:dev

# production mode
$ yarn run start:prod
```

## Run tests

```bash
# unit tests
$ yarn run test

# e2e tests
$ yarn run test:e2e

# test coverage
$ yarn run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ yarn install -g mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
