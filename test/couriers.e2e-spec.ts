import { startTestApp, createUser, asUser, TestApp, TestUser } from './harness';
import { UserRole } from '../src/shared/types/user.role';

/**
 * Курьера заводит администратор: сам зарегистрироваться он не может. Без
 * пароля получалась учётная запись, в которую невозможно войти.
 */
describe('Курьеры', () => {
  let testApp: TestApp;
  let admin: TestUser;

  const PASSWORD = 'CourierPass1';

  beforeAll(async () => {
    testApp = await startTestApp();
    admin = await createUser(testApp, [UserRole.ADMIN]);
  });

  afterAll(async () => {
    await testApp.close();
  });

  let counter = 0;

  const courierPayload = (overrides: Record<string, unknown> = {}) => {
    counter += 1;

    return {
      name: `Курьер ${counter}`,
      email: `courier-${Date.now()}-${counter}@example.com`,
      // номер должен быть уникален между прогонами: база прогона живёт дольше
      phone: `+79${String(Date.now()).slice(-8)}${counter % 10}`,
      password: PASSWORD,
      ...overrides,
    };
  };

  const createCourier = async (overrides: Record<string, unknown> = {}) => {
    const payload = courierPayload(overrides);

    const created = await testApp
      .http()
      .post('/user/currier')
      .set(asUser(admin))
      .send(payload);

    return { payload, response: created };
  };

  it('созданный курьер может войти в приложение', async () => {
    const { payload, response } = await createCourier();

    expect(response.status).toBe(201);
    expect(response.body.roles).toEqual([UserRole.CURRIER]);

    const login = await testApp
      .http()
      .post('/auth/email/login')
      .send({ email: payload.email, password: PASSWORD })
      .expect(200);

    expect(login.body.accessToken).toBeTruthy();
    expect(login.body.user.roles).toEqual([UserRole.CURRIER]);
  });

  it('пароль курьера не возвращается и не хранится как есть', async () => {
    const { payload, response } = await createCourier();

    expect(JSON.stringify(response.body)).not.toContain(PASSWORD);
    expect(JSON.stringify(response.body)).not.toContain('hash_password');

    const stored = await testApp.dataSource.query(
      'SELECT hash_password FROM "user" WHERE email = $1',
      [payload.email],
    );

    expect(stored[0].hash_password).toBeTruthy();
    expect(stored[0].hash_password).not.toBe(PASSWORD);
  });

  it('без пароля курьер не заводится', async () => {
    const payload = courierPayload();
    delete (payload as { password?: string }).password;

    await testApp
      .http()
      .post('/user/currier')
      .set(asUser(admin))
      .send(payload)
      .expect(400);
  });

  it('слабый пароль не принимается', async () => {
    const { response } = await createCourier({ password: 'qwerty' });

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain('8 символов');
  });

  it('администратор меняет курьеру пароль, и вход идёт по новому', async () => {
    const { payload, response } = await createCourier();
    const newPassword = 'AnotherPass2';

    await testApp
      .http()
      .patch(`/user/${response.body.id}`)
      .set(asUser(admin))
      .send({ password: newPassword })
      .expect(200);

    await testApp
      .http()
      .post('/auth/email/login')
      .send({ email: payload.email, password: PASSWORD })
      .expect(401);

    await testApp
      .http()
      .post('/auth/email/login')
      .send({ email: payload.email, password: newPassword })
      .expect(200);
  });

  it('заводить курьеров может только администратор', async () => {
    const customer = await createUser(testApp);

    await testApp
      .http()
      .post('/user/currier')
      .set(asUser(customer))
      .send(courierPayload())
      .expect(403);
  });
});
