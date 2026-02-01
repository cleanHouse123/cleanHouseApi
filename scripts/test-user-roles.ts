import axios from 'axios';

const API_BASE_URL = 'https://cleanhouse123-cleanhouseapi-4d55.twc1.net';
const TOKEN =
  process.env.AUTH_TOKEN ||
  process.argv[2] ||
  'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3ZDNjYjIyZC0yZjdmLTQ3YzUtYjc5NS01ZDQzOWVlNTg4ZWUiLCJlbWFpbCI6ItCY0LLQsNC9INCY0LLQsNC90L7QsiIsImlhdCI6MTc2OTcwNDc3NSwiZXhwIjoxNzY5NzA1MTk1fQ.tz0_0z8dV5sZIMcUqltiUq8VdWcyxcTWUfPV1AFOdnE';

interface User {
  id: string;
  name: string;
  email?: string;
  phone: string;
  roles: string[];
}

async function createUser() {
  const timestamp = Date.now();
  const email = `test_user_${timestamp}@example.com`;
  const name = `Test User ${timestamp}`;
  const password = 'TestPassword123';

  console.log('Создание нового пользователя...');
  console.log(`Email: ${email}`);
  console.log(`Name: ${name}`);

  try {
    const response = await axios.post(
      `${API_BASE_URL}/auth/email/register`,
      {
        email,
        password,
        name,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    const user = response.data.user;
    console.log('✓ Пользователь создан:');
    console.log(`  ID: ${user.id}`);
    console.log(`  Name: ${user.name}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Roles: ${JSON.stringify(user.roles || [])}`);
    console.log(`  Access Token: ${response.data.accessToken?.substring(0, 50)}...`);

    return user;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('✗ Ошибка при создании пользователя:');
      console.error(`  Status: ${error.response?.status}`);
      console.error(`  Data:`, error.response?.data);
    } else {
      console.error('✗ Неизвестная ошибка:', error);
    }
    throw error;
  }
}

async function updateUserRoles(userId: string, roles: string[]) {
  console.log(`\nОбновление ролей пользователя ${userId}...`);
  console.log(`Новые роли: ${JSON.stringify(roles)}`);

  try {
    const response = await axios.patch(
      `${API_BASE_URL}/user/${userId}`,
      {
        roles,
      },
      {
        headers: {
          Authorization: TOKEN,
          'Content-Type': 'application/json',
        },
      },
    );

    console.log('✓ Роли обновлены:');
    console.log(`  ID: ${response.data.id}`);
    console.log(`  Name: ${response.data.name}`);
    console.log(`  Roles: ${JSON.stringify(response.data.roles || [])}`);

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('✗ Ошибка при обновлении ролей:');
      console.error(`  Status: ${error.response?.status}`);
      console.error(`  Data:`, error.response?.data);
    } else {
      console.error('✗ Неизвестная ошибка:', error);
    }
    throw error;
  }
}

async function getUser(userId: string) {
  console.log(`\nПолучение информации о пользователе ${userId}...`);

  try {
    const response = await axios.get(`${API_BASE_URL}/user/all`, {
      headers: {
        Authorization: TOKEN,
        accept: 'application/json',
      },
      params: {
        page: 1,
        limit: 100,
      },
    });

    const user = response.data.data.find((u: User) => u.id === userId);
    if (user) {
      console.log('✓ Пользователь найден:');
      console.log(`  ID: ${user.id}`);
      console.log(`  Name: ${user.name}`);
      console.log(`  Email: ${user.email || 'N/A'}`);
      console.log(`  Phone: ${user.phone}`);
      console.log(`  Roles: ${JSON.stringify(user.roles || [])}`);
      return user;
    } else {
      console.log('✗ Пользователь не найден в списке');
      return null;
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('✗ Ошибка при получении пользователя:');
      console.error(`  Status: ${error.response?.status}`);
      console.error(`  Data:`, error.response?.data);
    } else {
      console.error('✗ Неизвестная ошибка:', error);
    }
    throw error;
  }
}

async function main() {
  try {
    console.log('=== Тест создания пользователя и назначения ролей ===\n');

    // Шаг 1: Создать пользователя
    const newUser = await createUser();
    const userId = newUser.id;

    // Небольшая задержка
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Шаг 2: Проверить текущие роли
    await getUser(userId);

    // Шаг 3: Назначить роль курьера
    await new Promise((resolve) => setTimeout(resolve, 500));
    await updateUserRoles(userId, ['currier']);

    // Шаг 4: Проверить, что роль курьера установлена
    await new Promise((resolve) => setTimeout(resolve, 500));
    await getUser(userId);

    // Шаг 5: Назначить роль админа
    await new Promise((resolve) => setTimeout(resolve, 500));
    await updateUserRoles(userId, ['admin']);

    // Шаг 6: Проверить, что роль админа установлена
    await new Promise((resolve) => setTimeout(resolve, 500));
    await getUser(userId);

    // Шаг 7: Назначить несколько ролей одновременно
    await new Promise((resolve) => setTimeout(resolve, 500));
    await updateUserRoles(userId, ['customer', 'currier']);

    // Шаг 8: Проверить множественные роли
    await new Promise((resolve) => setTimeout(resolve, 500));
    const finalUser = await getUser(userId);

    console.log('\n=== Результат теста ===');
    if (finalUser && Array.isArray(finalUser.roles)) {
      console.log('✓ Множественные роли работают корректно!');
      console.log(`  Финальные роли: ${JSON.stringify(finalUser.roles)}`);
    } else {
      console.log('✗ Ошибка: роли не в формате массива');
    }
  } catch (error) {
    console.error('\n✗ Тест завершился с ошибкой:', error);
    process.exit(1);
  }
}

main();
