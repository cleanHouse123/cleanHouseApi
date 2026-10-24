import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { UserRole } from '../src/shared/types/user.role';
import { User } from '../src/user/entities/user.entity';

// Значения задаём здесь, а не в .env: прогон не должен зависеть от того,
// что лежит у разработчика локально. ConfigModule читает путь к файлу в
// момент импорта AppModule, то есть ещё до вызова startTestApp
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-access-secret';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? 'e2e-refresh-secret';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '1h';
process.env.JWT_REFRESH_EXPIRES_IN =
  process.env.JWT_REFRESH_EXPIRES_IN ?? '7d';
process.env.YOOKASSA_MOCK_PAYMENTS = 'true';
process.env.YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID ?? '000000';
process.env.YOOKASSA_SECRET_KEY =
  process.env.YOOKASSA_SECRET_KEY ?? 'test_not_a_real_key';
process.env.TYPEORM_SYNCHRONIZE = 'true';
// регистрация через email выдаёт роль администратора и на бою закрыта;
// в изолированной тестовой базе она нужна, чтобы заводить участников
process.env.ALLOW_ADMIN_REGISTRATION = 'true';
// вебхук приходит не с адресов YooKassa, а из supertest: тесты идут тем же
// путём, что и настоящая оплата, поэтому проверку адреса снимаем здесь
process.env.YOOKASSA_WEBHOOK_ENFORCE_IP = 'false';
// телеграм-бот поднимается вместе с приложением и требует токен формата
// "<id>:<ключ>"; наружу он в тестах не ходит
process.env.TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN ?? '111111:e2e-not-a-real-bot-token';
process.env.TELEGRAM_BOT_API_KEY =
  process.env.TELEGRAM_BOT_API_KEY ?? '111111:e2e-not-a-real-bot-token';

/**
 * Прогон бизнес-флоу через настоящее приложение: поднимаем Nest на отдельной
 * базе, платежи и возвраты идут в mock-режиме, деньги никуда не уходят.
 *
 * Запуск (база поднимается рядом, например в docker):
 *   DATABASE_HOST=127.0.0.1 DATABASE_PORT=55499 DATABASE_USER=postgres \
 *   DATABASE_PASSWORD=test DATABASE_NAME=mussor_e2e npm run test:e2e
 */
export interface TestApp {
  app: INestApplication;
  dataSource: DataSource;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

export const startTestApp = async (): Promise<TestApp> => {
  process.env.TZ = 'UTC';

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  await app.init();

  const dataSource = app.get(DataSource);

  return {
    app,
    dataSource,
    http: () => request(app.getHttpServer()),
    close: async () => {
      await app.close();
    },
  };
};

let userCounter = 0;

export interface TestUser {
  id: string;
  email: string;
  token: string;
}

/** Регистрирует клиента и возвращает его токен */
export const createUser = async (
  testApp: TestApp,
  roles: UserRole[] = [UserRole.CUSTOMER],
): Promise<TestUser> => {
  userCounter += 1;
  const email = `e2e-${Date.now()}-${userCounter}@example.com`;

  const response = await testApp
    .http()
    .post('/auth/email/register')
    .send({ email, password: 'password123', name: `Клиент ${userCounter}` })
    .expect(201);

  const id = response.body.user.id;

  if (!roles.includes(UserRole.CUSTOMER) || roles.length > 1) {
    await testApp.dataSource.getRepository(User).update({ id }, { roles });
  }

  // роли попадают в токен при входе, поэтому логинимся после их выдачи
  const login = await testApp
    .http()
    .post('/auth/email/login')
    .send({ email, password: 'password123' })
    .expect(200);

  return { id, email, token: login.body.accessToken };
};

/**
 * Доводит заказ до оплаченного тем же путём, что и настоящая оплата:
 * платёж создаётся, затем приходит webhook `payment.succeeded`.
 * Симуляций оплаты в API больше нет — они были чёрным ходом.
 */
export const payForOrder = async (
  testApp: TestApp,
  user: TestUser,
  orderId: string,
  amountInKopecks: number,
): Promise<void> => {
  const payment = await testApp
    .http()
    .post('/orders/payment/create')
    .set(asUser(user))
    .send({ orderId, amount: amountInKopecks })
    .expect(201);

  await testApp
    .http()
    .post('/orders/payment/yookassa-webhook')
    .send({
      event: 'payment.succeeded',
      object: {
        id: `yk-${payment.body.paymentId}`,
        status: 'succeeded',
        metadata: { orderId, paymentId: payment.body.paymentId },
      },
    })
    .expect(201);
};

/** Заголовок авторизации для supertest */
export const asUser = (user: TestUser) => ({
  Authorization: `Bearer ${user.token}`,
});
