import { startTestApp, createUser, asUser, payForOrder, TestApp, TestUser } from './harness';
import { UserRole } from '../src/shared/types/user.role';

/**
 * «Заказы рядом» — главный список в приложении курьера, когда у телефона
 * есть геопозиция. Расстояние считается в SQL без PostGIS: расширения на
 * базе нет, и раньше эндпоинт отвечал 500 при любых параметрах.
 */
describe('Заказы рядом', () => {
  let testApp: TestApp;
  let admin: TestUser;
  let customer: TestUser;

  // Янино-1 — адрес, по которому идут заказы в прогоне
  const YANINO = { lat: 59.9385, lon: 30.568 };
  // примерно в двух километрах восточнее
  const NEARBY = { lat: 59.9385, lon: 30.6 };
  // Москва: сотни километров
  const FAR = { lat: 55.7558, lon: 37.6173 };

  const ADDRESS = 'Ленинградская обл, Всеволожский р-н, гп Янино-1, Шоссейная';

  beforeAll(async () => {
    testApp = await startTestApp();
    admin = await createUser(testApp, [UserRole.ADMIN]);
    customer = await createUser(testApp);
  });

  afterAll(async () => {
    await testApp.close();
  });

  /** Оплаченный заказ с заданными координатами */
  const orderAt = async (point: { lat: number; lon: number }) => {
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

    await payForOrder(testApp, customer, created.body.id, created.body.price);

    await testApp.dataSource.query(
      `UPDATE "order" SET coordinates = $1 WHERE id = $2`,
      [JSON.stringify(point), created.body.id],
    );

    return created.body.id as string;
  };

  const nearby = (query: string) =>
    testApp.http().get(`/orders/nearby?${query}`).set(asUser(admin));

  it('отвечает, а не падает', async () => {
    await orderAt(NEARBY);

    const response = await nearby(
      `lat=${YANINO.lat}&lon=${YANINO.lon}&status=paid&limit=100`,
    );

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.orders)).toBe(true);
  });

  it('считает расстояние в метрах', async () => {
    const id = await orderAt(NEARBY);

    const response = await nearby(
      `lat=${YANINO.lat}&lon=${YANINO.lon}&status=paid&limit=100`,
    ).expect(200);

    const order = (response.body.orders as { id: string; distance: number }[]).find(
      (item) => item.id === id,
    );

    // по долготе на этой широте градус — примерно 56 км, 0.032° ≈ 1.8 км
    expect(order?.distance).toBeGreaterThan(1500);
    expect(order?.distance).toBeLessThan(2200);
  });

  it('ближний заказ идёт раньше дальнего', async () => {
    const far = await orderAt(FAR);
    const near = await orderAt(NEARBY);

    const response = await nearby(
      `lat=${YANINO.lat}&lon=${YANINO.lon}&status=paid&limit=100`,
    ).expect(200);

    const ids = (response.body.orders as { id: string }[]).map((item) => item.id);

    expect(ids.indexOf(near)).toBeLessThan(ids.indexOf(far));
  });

  it('у заказа в той же точке расстояние нулевое, а не NaN', async () => {
    const id = await orderAt(YANINO);

    const response = await nearby(
      `lat=${YANINO.lat}&lon=${YANINO.lon}&status=paid&limit=100`,
    ).expect(200);

    const order = (response.body.orders as { id: string; distance: number }[]).find(
      (item) => item.id === id,
    );

    expect(order?.distance).toBeCloseTo(0, 5);
  });

  it('фильтр по статусу работает', async () => {
    await orderAt(NEARBY);

    const response = await nearby(
      `lat=${YANINO.lat}&lon=${YANINO.lon}&status=done&limit=100`,
    ).expect(200);

    expect(response.body.orders).toHaveLength(0);
  });
});
