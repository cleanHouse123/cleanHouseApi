import {
  startTestApp,
  createUser,
  asUser,
  TestApp,
  TestUser,
} from './harness';
import { UserRole } from '../src/shared/types/user.role';

/**
 * Расписания: заводятся подписчиком, закрыты от чужих, а движок создаёт
 * заказ тем же путём, что и ручное оформление.
 */
describe('Расписания заказов', () => {
  let testApp: TestApp;
  let admin: TestUser;
  let planId: string;

  const ADDRESS = 'Ленинградская обл, Всеволожский р-н, гп Янино-1, Шоссейная';
  const PLAN_PRICE_RUB = 1000;

  beforeAll(async () => {
    testApp = await startTestApp();
    admin = await createUser(testApp, [UserRole.ADMIN]);

    const plan = await testApp
      .http()
      .post('/subscription-plans')
      .set(asUser(admin))
      .send({
        type: 'monthly',
        name: 'Тариф для расписаний',
        description: 'Создан автотестом',
        priceInKopecks: PLAN_PRICE_RUB * 100,
        duration: '1 месяц',
        features: ['Проверка флоу'],
        icon: 'package',
        badgeColor: 'blue',
        ordersLimit: 10,
      })
      .expect(201);

    planId = plan.body.id;
  });

  afterAll(async () => {
    await testApp.close();
  });

  const subscriber = async (): Promise<TestUser> => {
    const user = await createUser(testApp);

    const subscription = await testApp
      .http()
      .post('/subscriptions/by-plan')
      .set(asUser(user))
      .send({ planId })
      .expect(201);

    const payment = await testApp
      .http()
      .post('/subscriptions/payment/create')
      .set(asUser(user))
      .send({
        subscriptionId: subscription.body.id,
        planId,
        subscriptionType: 'monthly',
        amount: PLAN_PRICE_RUB * 100,
      })
      .expect(201);

    await testApp
      .http()
      .post('/subscriptions/payment/yookassa-webhook')
      .send({
        event: 'payment.succeeded',
        object: {
          id: `yk-${payment.body.paymentId}`,
          status: 'succeeded',
          metadata: {
            subscriptionId: subscription.body.id,
            paymentId: payment.body.paymentId,
          },
        },
      })
      .expect(201);

    return user;
  };

  const createSchedule = async (user: TestUser, body: object = {}) =>
    testApp
      .http()
      .post('/scheduled-orders')
      .set(asUser(user))
      .send({
        address: ADDRESS,
        frequency: 'daily',
        preferredTime: '09:00',
        startDate: new Date().toISOString(),
        ...body,
      });

  it('подписчик заводит расписание', async () => {
    const user = await subscriber();

    const created = await createSchedule(user);

    expect(created.status).toBe(201);
    expect(created.body.isActive).toBe(true);
  });

  it('без подписки расписание не завести', async () => {
    const user = await createUser(testApp);

    const created = await createSchedule(user);

    expect(created.status).toBe(400);
  });

  it('дни недели возвращаются числами, а не строками', async () => {
    const user = await subscriber();

    await createSchedule(user, { frequency: 'custom', daysOfWeek: [2, 4] });

    const mine = await testApp
      .http()
      .get('/scheduled-orders/my-schedules')
      .set(asUser(user))
      .expect(200);

    const custom = mine.body.find(
      (item: { frequency: string }) => item.frequency === 'custom',
    );

    // из базы simple-array читается строками: по ним крон не срабатывал
    expect(custom.daysOfWeek).toEqual([2, 4]);
  });

  it('вынос, уже заказанный вручную, не повторяется', async () => {
    const user = await subscriber();
    const startDate = new Date().toISOString();

    const created = await createSchedule(user, {
      startDate,
      firstPickupAlreadyOrdered: true,
    });

    expect(created.status).toBe(201);
    expect(new Date(created.body.lastCreatedAt as string)).toEqual(
      new Date(startDate),
    );
  });

  describe('чужое расписание закрыто', () => {
    it('не прочитать, не изменить, не удалить', async () => {
      const owner = await subscriber();
      const stranger = await subscriber();

      const created = await createSchedule(owner);
      const id = created.body.id;

      await testApp
        .http()
        .get(`/scheduled-orders/${id}`)
        .set(asUser(stranger))
        .expect(403);

      await testApp
        .http()
        .patch(`/scheduled-orders/${id}`)
        .set(asUser(stranger))
        .send({ frequency: 'weekly' })
        .expect(403);

      await testApp
        .http()
        .delete(`/scheduled-orders/${id}`)
        .set(asUser(stranger))
        .expect(403);
    });

    it('своё — можно', async () => {
      const owner = await subscriber();
      const created = await createSchedule(owner);

      await testApp
        .http()
        .get(`/scheduled-orders/${created.body.id}`)
        .set(asUser(owner))
        .expect(200);

      await testApp
        .http()
        .delete(`/scheduled-orders/${created.body.id}`)
        .set(asUser(owner))
        .expect(200);
    });
  });
});
