import axios from 'axios';

const API_BASE_URL = 'https://cleanhouse123-cleanhouseapi-4d55.twc1.net';
const TOKEN =
  process.env.AUTH_TOKEN ||
  process.argv[2] ||
  'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3ZDNjYjIyZC0yZjdmLTQ3YzUtYjc5NS01ZDQzOWVlNTg4ZWUiLCJlbWFpbCI6ItCY0LLQsNC9INCY0LLQsNC90L7QsiIsImlhdCI6MTc2OTcwNDc3NSwiZXhwIjoxNzY5NzA1MTk1fQ.tz0_0z8dV5sZIMcUqltiUq8VdWcyxcTWUfPV1AFOdnE';

interface User {
  id: string;
  name: string;
  phone: string;
  role?: string;
  roles?: string[];
}

interface UsersResponse {
  data: User[];
  total: number;
  page: number;
  limit: number;
}

async function getAllUsers(): Promise<User[]> {
  const allUsers: User[] = [];
  let page = 1;
  const limit = 100;
  let hasMore = true;

  console.log('Получение списка пользователей...');

  while (hasMore) {
    try {
      const response = await axios.get<UsersResponse>(
        `${API_BASE_URL}/user/all`,
        {
          headers: {
            Authorization: TOKEN,
            accept: '*/*',
          },
          params: {
            page,
            limit,
          },
        },
      );

      const { data, total } = response.data;
      allUsers.push(...data);

      console.log(
        `Получено ${data.length} пользователей (страница ${page}, всего: ${total})`,
      );

      if (allUsers.length >= total) {
        hasMore = false;
      } else {
        page++;
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          `Ошибка при получении пользователей:`,
          error.response?.status,
          error.response?.data,
        );
      } else {
        console.error('Неизвестная ошибка:', error);
      }
      throw error;
    }
  }

  return allUsers;
}

async function deleteUser(userId: string, userName: string): Promise<boolean> {
  try {
    await axios.delete(`${API_BASE_URL}/user/${userId}`, {
      headers: {
        Authorization: TOKEN,
        accept: '*/*',
      },
    });
    console.log(`✓ Удален пользователь: ${userName} (${userId})`);
    return true;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        `✗ Ошибка при удалении пользователя ${userName} (${userId}):`,
        error.response?.status,
        error.response?.data,
      );
    } else {
      console.error(
        `✗ Неизвестная ошибка при удалении ${userName}:`,
        error,
      );
    }
    return false;
  }
}

async function main() {
  try {
    const users = await getAllUsers();
    console.log(`\nНайдено пользователей: ${users.length}`);
    console.log('Начинаю удаление...\n');

    let successCount = 0;
    let failCount = 0;

    for (const user of users) {
      const success = await deleteUser(user.id, user.name);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }

      // Небольшая задержка между запросами
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log(`\n=== Результат ===`);
    console.log(`Успешно удалено: ${successCount}`);
    console.log(`Ошибок: ${failCount}`);
    console.log(`Всего обработано: ${users.length}`);
  } catch (error) {
    console.error('Критическая ошибка:', error);
    process.exit(1);
  }
}

main();
