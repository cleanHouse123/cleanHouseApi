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
 * Рабочий день курьера: взять заказ, начать, завершить. И то, чего он уметь
 * не должен — трогать чужие заказы. Исполнитель берётся из токена: раньше
 * он приходил в теле запроса, и чужой id подставлял кто угодно.
 */
describe('Работа курьера', () => {
  let testApp: TestApp;
  let admin: TestUser;
  let customer: TestUser;
  let courier: TestUser;
  let otherCourier: TestUser;

  const ADDRESS = 'Ленинградская обл, Всеволожский р-н, гп Янино-1, Шоссейная';

  beforeAll(async () => {
    testApp = await startTestApp();
    admin = await createUser(testApp, [UserRole.ADMIN]);
    customer = await createUser(testApp);
    courier = await createUser(testApp, [UserRole.CURRIER]);
    otherCourier = await createUser(testApp, [UserRole.CURRIER]);
  });

  afterAll(async () => {
    await testApp.close();
  });

  /** Оплаченный заказ на завтра: отменять такой ещё можно */
  const paidOrder = async (): Promise<string> => {
    const created = await testApp
      .http()
      .post('/orders')
      .set(asUser(customer))
      .send({
        customerId: customer.id,
        address: ADDRESS,
        paymentMethod: 'online',
        numberPackages: 2,
        scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .expect(201);

    await payForOrder(testApp, customer, created.body.id, created.body.price);

    return created.body.id as string;
  };

  const statusOf = async (id: string) =>
    (
      await testApp.http().get(`/orders/${id}`).set(asUser(admin)).expect(200)
    ).body;

  it('курьер берёт заказ, начинает и завершает', async () => {
    const id = await paidOrder();

    const taken = await testApp
      .http()
      .patch(`/orders/${id}/take`)
      .set(asUser(courier))
      .send({})
      .expect(200);

    expect(taken.body.status).toBe('assigned');
    expect(taken.body.currier.id).toBe(courier.id);

    await testApp
      .http()
      .patch(`/orders/${id}/start`)
      .set(asUser(courier))
      .send({})
      .expect(200);

    expect((await statusOf(id)).status).toBe('in_progress');

    await testApp
      .http()
      .patch(`/orders/${id}/complete`)
      .set(asUser(courier))
      .send({})
      .expect(200);

    expect((await statusOf(id)).status).toBe('done');
  });

  it('чужим именем заказ не взять', async () => {
    const id = await paidOrder();

    // в теле — чужой курьер, но решает токен
    await testApp
      .http()
      .patch(`/orders/${id}/take`)
      .set(asUser(courier))
      .send({ courierId: otherCourier.id })
      .expect(200);

    expect((await statusOf(id)).currier.id).toBe(courier.id);
  });

  it('чужой заказ не начать и не завершить', async () => {
    const id = await paidOrder();

    await testApp
      .http()
      .patch(`/orders/${id}/take`)
      .set(asUser(courier))
      .send({})
      .expect(200);

    await testApp
      .http()
      .patch(`/orders/${id}/start`)
      .set(asUser(otherCourier))
      .send({ courierId: courier.id })
      .expect(400);

    expect((await statusOf(id)).status).toBe('assigned');
  });

  it('взятый заказ второй раз не взять', async () => {
    const id = await paidOrder();

    await testApp
      .http()
      .patch(`/orders/${id}/take`)
      .set(asUser(courier))
      .send({})
      .expect(200);

    await testApp
      .http()
      .patch(`/orders/${id}/take`)
      .set(asUser(otherCourier))
      .send({})
      .expect(400);
  });

  it('неоплаченный заказ взять нельзя', async () => {
    const created = await testApp
      .http()
      .post('/orders')
      .set(asUser(customer))
      .send({
        customerId: customer.id,
        address: ADDRESS,
        paymentMethod: 'online',
        numberPackages: 2,
      })
      .expect(201);

    await testApp
      .http()
      .patch(`/orders/${created.body.id}/take`)
      .set(asUser(courier))
      .send({})
      .expect(400);
  });

  describe('отмена', () => {
    it('курьер отменяет свой заказ', async () => {
      const id = await paidOrder();

      await testApp
        .http()
        .patch(`/orders/${id}/take`)
        .set(asUser(courier))
        .send({})
        .expect(200);

      await testApp
        .http()
        .patch(`/orders/${id}/cancel`)
        .set(asUser(courier))
        .send({ reason: 'Не успеваю' })
        .expect(200);

      expect((await statusOf(id)).status).toBe('canceled');
    });

    it('чужой заказ курьер не отменит', async () => {
      const id = await paidOrder();

      await testApp
        .http()
        .patch(`/orders/${id}/take`)
        .set(asUser(courier))
        .send({})
        .expect(200);

      await testApp
        .http()
        .patch(`/orders/${id}/cancel`)
        .set(asUser(otherCourier))
        .send({ courierId: courier.id })
        .expect(403);

      expect((await statusOf(id)).status).toBe('assigned');
    });

    it('ничейный заказ курьеру не отменить, а администратору можно', async () => {
      const id = await paidOrder();

      await testApp
        .http()
        .patch(`/orders/${id}/cancel`)
        .set(asUser(courier))
        .send({})
        .expect(403);

      await testApp
        .http()
        .patch(`/orders/${id}/cancel`)
        .set(asUser(admin))
        .send({})
        .expect(200);

      expect((await statusOf(id)).status).toBe('canceled');
    });

    it('клиент чужой заказ не отменит этим путём', async () => {
      const id = await paidOrder();
      const stranger = await createUser(testApp);

      await testApp
        .http()
        .patch(`/orders/${id}/cancel`)
        .set(asUser(stranger))
        .send({})
        .expect(403);
    });
  });

  describe('переназначение', () => {
    it('доступно администратору', async () => {
      const id = await paidOrder();

      await testApp
        .http()
        .patch(`/orders/${id}/take`)
        .set(asUser(courier))
        .send({})
        .expect(200);

      await testApp
        .http()
        .patch(`/orders/${id}/reassign`)
        .set(asUser(admin))
        .send({ newCourierId: otherCourier.id })
        .expect(200);

      expect((await statusOf(id)).currier.id).toBe(otherCourier.id);
    });

    it('курьеру недоступно', async () => {
      const id = await paidOrder();

      await testApp
        .http()
        .patch(`/orders/${id}/take`)
        .set(asUser(courier))
        .send({})
        .expect(200);

      await testApp
        .http()
        .patch(`/orders/${id}/reassign`)
        .set(asUser(courier))
        .send({ newCourierId: otherCourier.id })
        .expect(403);
    });
  });
});
