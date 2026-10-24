import {
  startTestApp,
  createUser,
  asUser,
  TestApp,
  TestUser,
} from './harness';
import { UserRole } from '../src/shared/types/user.role';

/**
 * Подписка: покупка, заказы из лимита, правило трёх часов при отмене
 * и возврат по пункту 6.7 Оферты.
 */
describe('Подписки', () => {
  let testApp: TestApp;
  let admin: TestUser;
  let customer: TestUser;
  let planId: string;

  const ADDRESS = 'Ленинградская обл, Всеволожский р-н, гп Янино-1, Шоссейная';
  const PLAN_PRICE_RUB = 1000;
  const PLAN_LIMIT = 10;

  beforeAll(async () => {
    testApp = await startTestApp();
    admin = await createUser(testApp, [UserRole.ADMIN]);

    const plan = await testApp
      .http()
      .post('/subscription-plans')
      .set(asUser(admin))
      .send({
        type: 'monthly',
        name: 'Тариф для прогона',
        description: 'Создан автотестом',
        priceInKopecks: PLAN_PRICE_RUB * 100,
        duration: '1 месяц',
        features: ['Проверка флоу'],
        icon: 'package',
        badgeColor: 'blue',
        ordersLimit: PLAN_LIMIT,
      })
      .expect(201);

    planId = plan.body.id;
  });

  afterAll(async () => {
    await testApp.close();
  });

  /** Клиент с оплаченной подпиской */
  const customerWithSubscription = async (): Promise<{
    user: TestUser;
    subscriptionId: string;
  }> => {
    const user = await createUser(testApp);

    const created = await testApp
      .http()
      .post('/subscriptions/by-plan')
      .set(asUser(user))
      .send({ planId })
      .expect(201);

    const subscriptionId = created.body.id;

    const payment = await testApp
      .http()
      .post('/subscriptions/payment/create')
      .set(asUser(user))
      .send({
        subscriptionId,
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
          metadata: { subscriptionId, paymentId: payment.body.paymentId },
        },
      })
      .expect(201);

    return { user, subscriptionId };
  };

  /** Заказ по подписке на указанное время выноса */
  const orderBySubscription = async (user: TestUser, scheduledAt: string) =>
    testApp
      .http()
      .post('/orders')
      .set(asUser(user))
      .send({
        customerId: user.id,
        address: ADDRESS,
        paymentMethod: 'subscription',
        numberPackages: 2,
        scheduledAt,
      })
      .expect(201);

  const hoursFromNow = (hours: number) =>
    new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

  const subscriptionOf = async (user: TestUser, subscriptionId: string) =>
    (
      await testApp
        .http()
        .get(`/subscriptions/${subscriptionId}`)
        .set(asUser(user))
        .expect(200)
    ).body;

  it('оплаченная подписка становится активной', async () => {
    const { user, subscriptionId } = await customerWithSubscription();
    const subscription = await subscriptionOf(user, subscriptionId);

    expect(subscription.status).toBe('active');
    expect(subscription.ordersLimit).toBe(PLAN_LIMIT);
    expect(subscription.usedOrders).toBe(0);
  });

  it('заказ по подписке денег не стоит и тратит вынос', async () => {
    const { user, subscriptionId } = await customerWithSubscription();

    const order = await orderBySubscription(user, hoursFromNow(24));

    expect(order.body.status).toBe('paid');

    const subscription = await subscriptionOf(user, subscriptionId);
    expect(subscription.usedOrders).toBe(1);
  });

  describe('правило трёх часов', () => {
    it('отмена заранее возвращает вынос', async () => {
      const { user, subscriptionId } = await customerWithSubscription();
      const order = await orderBySubscription(user, hoursFromNow(24));

      await testApp
        .http()
        .patch(`/orders/${order.body.id}/cancel-by-customer`)
        .set(asUser(user))
        .expect(200);

      const subscription = await subscriptionOf(user, subscriptionId);
      expect(subscription.usedOrders).toBe(0);
    });

    it('поздняя отмена вынос списывает', async () => {
      const { user, subscriptionId } = await customerWithSubscription();
      const order = await orderBySubscription(user, hoursFromNow(1));

      await testApp
        .http()
        .patch(`/orders/${order.body.id}/cancel-by-customer`)
        .set(asUser(user))
        .expect(200);

      const subscription = await subscriptionOf(user, subscriptionId);
      expect(subscription.usedOrders).toBe(1);
    });

    it('администратор может вернуть вынос вопреки сроку', async () => {
      const { user, subscriptionId } = await customerWithSubscription();
      const order = await orderBySubscription(user, hoursFromNow(1));

      await testApp
        .http()
        .patch(`/orders/${order.body.id}/status`)
        .set(asUser(admin))
        .send({ status: 'canceled', returnPickup: true })
        .expect(200);

      const subscription = await subscriptionOf(user, subscriptionId);
      expect(subscription.usedOrders).toBe(0);
    });
  });

  describe('отказ от подписки и возврат по 6.7', () => {
    it('отказ не удаляет подписку и ставит её в очередь', async () => {
      const { user, subscriptionId } = await customerWithSubscription();
      await orderBySubscription(user, hoursFromNow(24));

      await testApp
        .http()
        .patch(`/subscriptions/${subscriptionId}/cancel-by-customer`)
        .set(asUser(user))
        .expect(200);

      const subscription = await subscriptionOf(user, subscriptionId);
      expect(subscription.status).toBe('canceled');
      expect(subscription.usedOrders).toBe(1);

      const queue = await testApp
        .http()
        .get('/subscriptions/refunds/awaiting')
        .set(asUser(admin))
        .expect(200);

      const queued = queue.body.find(
        (item: { subscriptionId: string }) =>
          item.subscriptionId === subscriptionId,
      );

      // использован один вынос из десяти — возвращаем девять десятых
      expect(queued.suggested.refundAmount).toBe(
        PLAN_PRICE_RUB * 100 - (PLAN_PRICE_RUB * 100) / PLAN_LIMIT,
      );
    });

    it('возврат по формуле уходит и закрывает очередь', async () => {
      const { user, subscriptionId } = await customerWithSubscription();
      await orderBySubscription(user, hoursFromNow(24));

      await testApp
        .http()
        .patch(`/subscriptions/${subscriptionId}/cancel-by-customer`)
        .set(asUser(user))
        .expect(200);

      await testApp
        .http()
        .post(`/subscriptions/${subscriptionId}/cancel-with-refund`)
        .set(asUser(admin))
        .send({ refund: 'full' })
        .expect(201);

      const queue = await testApp
        .http()
        .get('/subscriptions/refunds/awaiting')
        .set(asUser(admin))
        .expect(200);

      expect(
        queue.body.some(
          (item: { subscriptionId: string }) =>
            item.subscriptionId === subscriptionId,
        ),
      ).toBe(false);
    });

    it('решение по возврату принимается один раз', async () => {
      const { user, subscriptionId } = await customerWithSubscription();

      await testApp
        .http()
        .patch(`/subscriptions/${subscriptionId}/cancel-by-customer`)
        .set(asUser(user))
        .expect(200);

      await testApp
        .http()
        .post(`/subscriptions/${subscriptionId}/cancel-with-refund`)
        .set(asUser(admin))
        .send({ refund: 'full' })
        .expect(201);

      await testApp
        .http()
        .post(`/subscriptions/${subscriptionId}/cancel-with-refund`)
        .set(asUser(admin))
        .send({ refund: 'full' })
        .expect(400);
    });

    it('после отказа заказ по подписке не оформить', async () => {
      const { user, subscriptionId } = await customerWithSubscription();

      await testApp
        .http()
        .patch(`/subscriptions/${subscriptionId}/cancel-by-customer`)
        .set(asUser(user))
        .expect(200);

      await testApp
        .http()
        .post('/orders')
        .set(asUser(user))
        .send({
          customerId: user.id,
          address: ADDRESS,
          paymentMethod: 'subscription',
          numberPackages: 2,
        })
        .expect(400);
    });

    it('чужую подписку отменить нельзя', async () => {
      const { subscriptionId } = await customerWithSubscription();
      const stranger = await createUser(testApp);

      await testApp
        .http()
        .patch(`/subscriptions/${subscriptionId}/cancel-by-customer`)
        .set(asUser(stranger))
        .expect(403);
    });
  });
});
