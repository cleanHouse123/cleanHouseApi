import axios from 'axios';

const API_BASE_URL = 'https://cleanhouse123-cleanhouseapi-4d55.twc1.net';
const TOKEN =
  process.env.AUTH_TOKEN ||
  process.argv[2] ||
  'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3ZDNjYjIyZC0yZjdmLTQ3YzUtYjc5NS01ZDQzOWVlNTg4ZWUiLCJlbWFpbCI6ItCY0LLQsNC9INCY0LLQsNC90L7QsiIsImlhdCI6MTc2OTcwNTI4MCwiZXhwIjoxNzY5NzA1NzAwfQ.Wye-y1yQDwe8EJqxLwefrx8p-qmSrSbxoxHpaIwFOxA';

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

async function changeOrderStatus(
  orderId: string,
  status: string,
): Promise<boolean> {
  try {
    await axios.patch(
      `${API_BASE_URL}/orders/${orderId}/status`,
      { status },
      {
        headers: {
          Authorization: TOKEN,
          'Content-Type': 'application/json',
        },
      },
    );
    return true;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        `Ошибка при изменении статуса заказа ${orderId}:`,
        error.response?.status,
        error.response?.data,
      );
    }
    return false;
  }
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
      const status = error.response?.status;
      const message = error.response?.data?.message || 'Unknown error';
      
      if (status === 400 && message.includes('Нельзя удалить')) {
        return false;
      } else {
        console.error(
          `✗ Ошибка при удалении заказа ${orderInfo} (${orderId}):`,
          status,
          message,
        );
        return false;
      }
    } else {
      console.error(`✗ Неизвестная ошибка при удалении ${orderInfo}:`, error);
      return false;
    }
  }
}

async function deleteAllOrders(): Promise<{ deleted: number }> {
  try {
    const response = await axios.delete(
      `${API_BASE_URL}/orders/admin/delete-all`,
      {
        headers: {
          Authorization: TOKEN,
          accept: 'application/json',
        },
      },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        `Ошибка при удалении всех заказов:`,
        error.response?.status,
        error.response?.data,
      );
    } else {
      console.error('Неизвестная ошибка:', error);
    }
    throw error;
  }
}

async function main() {
  try {
    const orders = await getAllOrders();
    console.log(`\nНайдено заказов: ${orders.length}`);
    
    if (orders.length === 0) {
      console.log('Нет заказов для удаления.');
      return;
    }

    // Группировка по статусам
    const statusCounts: Record<string, number> = {};
    orders.forEach((order) => {
      statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
    });

    console.log('\nЗаказы по статусам:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

    console.log(`\nУдаление всех заказов через админский endpoint...\n`);

    const result = await deleteAllOrders();
    
    console.log(`\n=== Результат ===`);
    console.log(`Успешно удалено: ${result.deleted}`);

    if (result.deleted > 0) {
      console.log(`\n✓ Все заказы успешно удалены!`);
    } else {
      console.log(`\n⚠ Заказы не были удалены`);
    }
  } catch (error) {
    console.error('Критическая ошибка:', error);
    process.exit(1);
  }
}

main();
