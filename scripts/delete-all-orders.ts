import axios from 'axios';

const API_BASE_URL = 'https://cleanhouse123-cleanhouseapi-4d55.twc1.net';
const TOKEN =
  process.env.AUTH_TOKEN ||
  process.argv[2] ||
  'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3ZDNjYjIyZC0yZjdmLTQ3YzUtYjc5NS01ZDQzOWVlNTg4ZWUiLCJlbWFpbCI6ItCY0LLQsNC9INCY0LLQsNC90L7QsiIsImlhdCI6MTc2OTcwNDc3NSwiZXhwIjoxNzY5NzA1MTk1fQ.tz0_0z8dV5sZIMcUqltiUq8VdWcyxcTWUfPV1AFOdnE';

interface Order {
  id: string;
  customerId: string;
  address: string;
  price: number;
  status: string;
  scheduledAt?: string;
}

interface OrdersResponse {
  orders: Order[];
  total: number;
}

async function getAllOrders(): Promise<Order[]> {
  const allOrders: Order[] = [];
  let page = 1;
  const limit = 100;
  let hasMore = true;

  console.log('Получение списка заказов...');

  while (hasMore) {
    try {
      const response = await axios.get<OrdersResponse>(
        `${API_BASE_URL}/orders`,
        {
          headers: {
            Authorization: TOKEN,
            accept: 'application/json',
          },
          params: {
            page,
            limit,
            startScheduledAtDate: '2020-01-01T00:00:00Z',
            endScheduledAtDate: '2030-12-31T23:59:59Z',
          },
        },
      );

      const { orders, total } = response.data;
      allOrders.push(...orders);

      console.log(
        `Получено ${orders.length} заказов (страница ${page}, всего: ${total})`,
      );

      if (allOrders.length >= total) {
        hasMore = false;
      } else {
        page++;
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          `Ошибка при получении заказов:`,
          error.response?.status,
          error.response?.data,
        );
      } else {
        console.error('Неизвестная ошибка:', error);
      }
      throw error;
    }
  }

  return allOrders;
}

async function deleteOrder(orderId: string, orderInfo: string): Promise<boolean> {
  try {
    await axios.delete(`${API_BASE_URL}/orders/${orderId}`, {
      headers: {
        Authorization: TOKEN,
        accept: '*/*',
      },
    });
    console.log(`✓ Удален заказ: ${orderInfo} (${orderId})`);
    return true;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        `✗ Ошибка при удалении заказа ${orderInfo} (${orderId}):`,
        error.response?.status,
        error.response?.data,
      );
    } else {
      console.error(`✗ Неизвестная ошибка при удалении ${orderInfo}:`, error);
    }
    return false;
  }
}

async function main() {
  try {
    const orders = await getAllOrders();
    console.log(`\nНайдено заказов: ${orders.length}`);
    console.log('Начинаю удаление...\n');

    let successCount = 0;
    let failCount = 0;

    for (const order of orders) {
      const orderInfo = `ID: ${order.id}, статус: ${order.status}, цена: ${order.price}`;
      const success = await deleteOrder(order.id, orderInfo);
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
    console.log(`Всего обработано: ${orders.length}`);
  } catch (error) {
    console.error('Критическая ошибка:', error);
    process.exit(1);
  }
}

main();
