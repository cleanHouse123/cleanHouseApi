import {
  startTestApp,
  createUser,
  asUser,
  TestApp,
  TestUser,
} from './harness';
import { UserRole } from '../src/shared/types/user.role';
import { ScheduledOrdersService } from '../src/scheduled-orders/services/scheduled-orders.service';

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

  const subscriber = async (): Promise<TestUser & { subscriptionId: string }> => {
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

    return { ...user, subscriptionId: subscription.body.id };
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

  /** Московский полдень следующих суток: всегда в будущем и всегда внутри дня */
  const nextMoscowNoon = (): Date => {
    const moscow = new Date(Date.now() + 180 * 60 * 1000);

    return new Date(
      Date.UTC(
        moscow.getUTCFullYear(),
        moscow.getUTCMonth(),
        moscow.getUTCDate() + 1,
        12,
        0,
      ) -
        180 * 60 * 1000,
    );
  };

  const liveOrdersAt = async (user: TestUser, scheduledAt: Date) => {
    const mine = await testApp
      .http()
      .get(`/orders/customer/${user.id}`)
      .set(asUser(user))
      .expect(200);

    return (
      mine.body as { status: string; scheduledAt: string }[]
    ).filter(
      (order) =>
        order.status !== 'canceled' &&
        new Date(order.scheduledAt).getTime() === scheduledAt.getTime(),
    );
  };

  it('движок создаёт заказ на подошедший вынос', async () => {
    const user = await subscriber();
    const pickup = nextMoscowNoon();

    expect((await createSchedule(user, { preferredTime: '12:00' })).status).toBe(
      201,
    );

    await testApp.app
      .get(ScheduledOrdersService)
      .processScheduledOrders(new Date(pickup.getTime() - 60 * 60 * 1000));

    const created = await liveOrdersAt(user, pickup);

    expect(created).toHaveLength(1);
    expect(created[0].status).toBe('paid');
  });

  it('второй заказ на тот же вынос не создаётся', async () => {
    const user = await subscriber();
    const pickup = nextMoscowNoon();
    const hourBefore = new Date(pickup.getTime() - 60 * 60 * 1000);

    expect((await createSchedule(user, { preferredTime: '12:00' })).status).toBe(
      201,
    );

    const engine = testApp.app.get(ScheduledOrdersService);

    // клиент успел оформить этот вынос сам
    await testApp
      .http()
      .post('/orders')
      .set(asUser(user))
      .send({
        customerId: user.id,
        address: ADDRESS,
        paymentMethod: 'subscription',
        numberPackages: 2,
        scheduledAt: pickup.toISOString(),
      })
      .expect(201);

    await engine.processScheduledOrders(hourBefore);
    // а крон ходит раз в полчаса
    await engine.processScheduledOrders(hourBefore);

    expect(await liveOrdersAt(user, pickup)).toHaveLength(1);
  });

  it('смена частоты включает расписание сразу, а не после заказанного выноса', async () => {
    const user = await subscriber();
    const pickup = nextMoscowNoon();

    const created = await createSchedule(user, {
      frequency: 'weekly',
      preferredTime: '08:00',
      firstPickupAlreadyOrdered: true,
    });

    expect(created.body.lastCreatedAt).toBeTruthy();

    const changed = await testApp
      .http()
      .patch(`/scheduled-orders/${created.body.id}`)
      .set(asUser(user))
      .send({ frequency: 'daily', preferredTime: '12:00' })
      .expect(200);

    expect(changed.body.lastCreatedAt).toBeFalsy();

    await testApp.app
      .get(ScheduledOrdersService)
      .processScheduledOrders(new Date(pickup.getTime() - 60 * 60 * 1000));

    expect(await liveOrdersAt(user, pickup)).toHaveLength(1);
  });

  it('включение расписания историю заказов не забывает', async () => {
    const user = await subscriber();

    const created = await createSchedule(user, {
      firstPickupAlreadyOrdered: true,
    });

    await testApp
      .http()
      .patch(`/scheduled-orders/${created.body.id}/deactivate`)
      .set(asUser(user))
      .expect(200);

    const activated = await testApp
      .http()
      .patch(`/scheduled-orders/${created.body.id}/activate`)
      .set(asUser(user))
      .expect(200);

    expect(activated.body.lastCreatedAt).toBeTruthy();
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

  it('отказ от подписки гасит расписания клиента', async () => {
    const user = await subscriber();
    await createSchedule(user);

    await testApp
      .http()
      .patch(`/subscriptions/${user.subscriptionId}/cancel-by-customer`)
      .set(asUser(user))
      .expect(200);

    const schedules = await testApp
      .http()
      .get('/scheduled-orders/my-schedules')
      .set(asUser(user))
      .expect(200);

    // без подписки они всё равно ничего не создадут — гасим сразу,
    // чтобы клиент не видел активными мёртвые расписания
    expect(schedules.body.every((item: { isActive: boolean }) => !item.isActive)).toBe(
      true,
    );
  });

  it('администратор может прогнать расписания вручную', async () => {
    await testApp
      .http()
      .post('/scheduled-orders/run')
      .set(asUser(admin))
      .expect(201);
  });

  it('обычному клиенту ручной прогон недоступен', async () => {
    const user = await createUser(testApp);

    await testApp
      .http()
      .post('/scheduled-orders/run')
      .set(asUser(user))
      .expect(403);
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
