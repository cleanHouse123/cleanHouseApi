import {
  startTestApp,
  createUser,
  asUser,
  payForOrder,
  TestApp,
  TestUser,
} from './harness';
import { UserRole } from '../src/shared/types/user.role';

/**
 * Заказ за деньги: от оформления до решения по возврату.
 *
 * Суммы здесь проверяются в копейках намеренно — именно на единицах
 * измерения возврат однажды насчитал в сто раз больше.
 */
describe('Заказы и возвраты', () => {
  let testApp: TestApp;
  let customer: TestUser;
  let admin: TestUser;

  const ADDRESS = 'Ленинградская обл, Всеволожский р-н, гп Янино-1, Шоссейная';

  beforeAll(async () => {
    testApp = await startTestApp();
    admin = await createUser(testApp, [UserRole.ADMIN]);
  });

  beforeEach(async () => {
    customer = await createUser(testApp);
  });

  afterAll(async () => {
    await testApp.close();
  });

  /** Заказ, доведённый до оплаченного состояния настоящим путём */
  const createPaidOrder = async (user: TestUser, scheduledAt?: string) => {
    const created = await testApp
      .http()
      .post('/orders')
      .set(asUser(user))
      .send({
        customerId: user.id,
        address: ADDRESS,
        paymentMethod: 'online',
        numberPackages: 2,
        ...(scheduledAt && { scheduledAt }),
      })
      .expect(201);

    await payForOrder(testApp, user, created.body.id, created.body.price);

    return created.body;
  };

  it('заказ создаётся и оплачивается', async () => {
    const order = await createPaidOrder(customer);

    const fetched = await testApp
      .http()
      .get(`/orders/${order.id}`)
      .set(asUser(admin))
      .expect(200);

    expect(fetched.body.status).toBe('paid');
    expect(fetched.body.price).toBeGreaterThan(0);
  });

  it('полный возврат уходит на оплаченную сумму в копейках', async () => {
    const order = await createPaidOrder(customer);

    await testApp
      .http()
      .post(`/orders/${order.id}/cancel-with-refund`)
      .set(asUser(admin))
      .send({ refund: 'full' })
      .expect(201);

    const fetched = await testApp
      .http()
      .get(`/orders/${order.id}`)
      .set(asUser(admin))
      .expect(200);

    expect(fetched.body.status).toBe('canceled');

    const refunded = fetched.body.payments.find(
      (payment: { refundStatus?: string }) => payment.refundStatus,
    );
    expect(refunded.refundAmount).toBe(Math.round(Number(refunded.amount)));
    expect(refunded.refundStatus).toBe('succeeded');
  });

  it('частичный возврат берёт рубли из формы', async () => {
    const order = await createPaidOrder(customer);

    await testApp
      .http()
      .post(`/orders/${order.id}/cancel-with-refund`)
      .set(asUser(admin))
      .send({ refund: 'partial', amount: 1 })
      .expect(201);

    const fetched = await testApp
      .http()
      .get(`/orders/${order.id}`)
      .set(asUser(admin))
      .expect(200);

    const refunded = fetched.body.payments.find(
      (payment: { refundStatus?: string }) => payment.refundStatus,
    );
    expect(refunded.refundAmount).toBe(100);
  });

  it('отказ в возврате без причины не принимается', async () => {
    const order = await createPaidOrder(customer);

    await testApp
      .http()
      .post(`/orders/${order.id}/cancel-with-refund`)
      .set(asUser(admin))
      .send({ refund: 'none' })
      .expect(400);
  });

  it('решение по возврату принимается один раз', async () => {
    const order = await createPaidOrder(customer);

    await testApp
      .http()
      .post(`/orders/${order.id}/cancel-with-refund`)
      .set(asUser(admin))
      .send({ refund: 'partial', amount: 1 })
      .expect(201);

    await testApp
      .http()
      .post(`/orders/${order.id}/cancel-with-refund`)
      .set(asUser(admin))
      .send({ refund: 'full' })
      .expect(400);
  });

  it('отменённый в обход диалога заказ попадает в очередь и уходит из неё', async () => {
    const order = await createPaidOrder(customer);

    await testApp
      .http()
      .patch(`/orders/${order.id}/status`)
      .set(asUser(admin))
      .send({ status: 'canceled' })
      .expect(200);

    const queued = await testApp
      .http()
      .get('/orders/refunds/awaiting')
      .set(asUser(admin))
      .expect(200);

    expect(
      queued.body.some(
        (item: { orderId: string }) => item.orderId === order.id,
      ),
    ).toBe(true);

    await testApp
      .http()
      .post(`/orders/${order.id}/cancel-with-refund`)
      .set(asUser(admin))
      .send({ refund: 'full' })
      .expect(201);

    const after = await testApp
      .http()
      .get('/orders/refunds/awaiting')
      .set(asUser(admin))
      .expect(200);

    expect(
      after.body.some((item: { orderId: string }) => item.orderId === order.id),
    ).toBe(false);
  });

  it('чужой заказ клиент отменить не может', async () => {
    const order = await createPaidOrder(customer);
    const stranger = await createUser(testApp);

    await testApp
      .http()
      .patch(`/orders/${order.id}/cancel-by-customer`)
      .set(asUser(stranger))
      .expect(400);
  });
});
