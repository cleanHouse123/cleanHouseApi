# Система заказов с онлайн-оплатой

## Обзор

Система заказов Clean House позволяет клиентам создавать заказы на вынос мусора и оплачивать их онлайн через упрощенную форму с WebSocket уведомлениями в реальном времени. Все заказы имеют фиксированную цену 200 рублей.

## Архитектура системы

### Основные компоненты:

- **Order** - основная сущность заказа
- **Payment** - платеж по заказу (в базе данных)
- **OrderPaymentService** - сервис для управления платежами (БД + память)
- **OrderPaymentGateway** - WebSocket для уведомлений
- **OrderPaymentPageController** - контроллер формы оплаты

### Статусы заказа:

- `NEW` - новый заказ
- `PAID` - оплачен (новый статус)
- `ASSIGNED` - назначен курьеру (после оплаты)
- `IN_PROGRESS` - выполняется
- `DONE` - выполнен
- `CANCELED` - отменен

### Статусы платежа:

- `PENDING` - ожидание оплаты
- `PAID` - оплачен
- `FAILED` - ошибка оплаты
- `REFUNDED` - возврат

## Полный флоу оплаты заказа

### ⚠️ Важно: Логика создания платежей

- **Заказ создается БЕЗ платежа** - только основная информация
- **Платеж создается только при создании ссылки на оплату** - один раз на заказ
- **Повторные запросы ссылки** возвращают существующий платеж
- **Защита от дубликатов** - один заказ = один платеж

### 1. Создание заказа

**Эндпоинт:** `POST /orders`
**Авторизация:** Требуется JWT токен

```http
POST /orders
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "customerId": "123e4567-e89b-12d3-a456-426614174000",
  "address": "ул. Пушкина, д. 10, кв. 5",
  "description": "Вынос мусора после ремонта",
  "scheduledAt": "2024-01-15T10:00:00Z",
  "notes": "Большие коробки",
  "paymentMethod": "online"
}
```

**Ответ:**

```json
{
  "id": "order-uuid",
  "customer": { "id": "uuid", "name": "Иван", "phone": "+79123456789" },
  "address": "ул. Пушкина, д. 10, кв. 5",
  "description": "Вынос мусора после ремонта",
  "price": 200.0,
  "status": "NEW",
  "scheduledAt": "2024-01-15T10:00:00Z",
  "notes": "Большие коробки",
  "payments": [],
  "createdAt": "2024-01-15T09:00:00Z",
  "updatedAt": "2024-01-15T09:00:00Z"
}
```

### 2. Создание ссылки на оплату

**Эндпоинт:** `POST /orders/payment/create`
**Авторизация:** Требуется JWT токен

```http
POST /orders/payment/create
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "orderId": "order-uuid",
  "amount": 200.0
}
```

**Ответ:**

```json
{
  "paymentUrl": "http://localhost:3000/order-payment/payment-uuid",
  "paymentId": "payment-uuid",
  "status": "pending"
}
```

### 3. Открытие формы оплаты

**Эндпоинт:** `GET /order-payment/{paymentId}`
**Авторизация:** Не требуется (публичный)

Пользователь переходит по ссылке `paymentUrl`, открывается упрощенная форма оплаты с:

- Полем для номера карты (автоформатирование)
- Полем для срока действия (MM/YY)
- Полем для CVV
- Полем для имени держателя карты
- Кнопкой "Оплатить заказ"

### 4. Процесс оплаты

При нажатии "Оплатить заказ":

1. Проверяется заполненность всех полей
2. Отправляется запрос на симуляцию оплаты
3. WebSocket уведомляет о результате
4. При успехе окно закрывается через 3 секунды

### 5. WebSocket подключение

При загрузке формы автоматически:

```javascript
const socket = io('http://localhost:3000');

socket.on('connect', () => {
  socket.emit('join_order_payment_room', {
    userId: 'user-id',
    paymentId: 'payment-uuid',
  });
});
```

### 6. Периодическая проверка статуса

WebSocket каждые 2 секунды отправляет:

```javascript
socket.on('order_payment_status_update', (data) => {
  console.log('Статус платежа:', data.status);
  // data: { paymentId, status, timestamp }
});
```

**Статусы:**

- `pending` - ожидание обработки
- `processing` - обработка платежа
- `success` - успешная оплата
- `failed` - ошибка оплаты

### 7. Финальные уведомления

**При успехе:**

```javascript
socket.on('order_payment_success', (data) => {
  console.log('Оплата успешна!', data);
  // data: { paymentId, orderId, message, timestamp }
  // Окно автоматически закрывается через 3 секунды
});
```

**При ошибке:**

```javascript
socket.on('order_payment_error', (data) => {
  console.log('Ошибка оплаты:', data.error);
  // data: { paymentId, orderId, error, timestamp }
});
```

### 8. Обновление статуса заказа

При успешной оплате:

- Статус заказа меняется с `NEW` на `PAID`
- Статус платежа меняется с `PENDING` на `PAID`
- Заказ готов к назначению курьера (PAID → ASSIGNED)

## ⚠️ Важные изменения в системе

### Новый статус PAID

- Добавлен статус `PAID` между `NEW` и `ASSIGNED`
- При оплате заказ переходит: `NEW` → `PAID` → `ASSIGNED`
- Это позволяет четко разделить оплаченные и неоплаченные заказы

### Упрощенная форма оплаты

- Убрана сложная система подтверждения
- Прямая оплата после заполнения формы
- Автоматическое закрытие окна при успехе

### Обновленная логика платежей

- Платежи создаются только при создании ссылки на оплату
- Один заказ = один платеж (защита от дубликатов)
- Платежи сохраняются в базе данных
- Синхронизация между памятью и БД
- Корректное обновление статусов

## Реализация на фронтенде

### 1. Создание заказа

```typescript
interface CreateOrderRequest {
  customerId: string;
  address: string;
  description?: string;
  scheduledAt?: string;
  notes?: string;
  paymentMethod: 'online' | 'cash' | 'card';
}

async function createOrder(
  orderData: CreateOrderRequest,
): Promise<OrderResponse> {
  const response = await fetch('/orders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(orderData),
  });

  return response.json();
}
```

### 2. Создание платежа

```typescript
interface CreatePaymentRequest {
  orderId: string;
  amount: number;
}

interface PaymentResponse {
  paymentUrl: string;
  paymentId: string;
  status: string;
}

async function createPaymentLink(
  paymentData: CreatePaymentRequest,
): Promise<PaymentResponse> {
  const response = await fetch('/orders/payment/create', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(paymentData),
  });

  return response.json();
}
```

### 3. Открытие формы оплаты

```typescript
function openPaymentForm(paymentUrl: string) {
  // Открываем в новом окне/вкладке
  const paymentWindow = window.open(
    paymentUrl,
    'payment',
    'width=600,height=700,scrollbars=yes,resizable=yes',
  );

  // Можно отслеживать закрытие окна
  const checkClosed = setInterval(() => {
    if (paymentWindow.closed) {
      clearInterval(checkClosed);
      // Обновляем статус заказа
      refreshOrderStatus();
    }
  }, 1000);
}
```

### 4. WebSocket подключение (опционально)

Если нужно отслеживать статус из основного окна:

```typescript
import io from 'socket.io-client';

class OrderPaymentTracker {
  private socket: any;

  constructor(paymentId: string, userId: string) {
    this.socket = io('http://localhost:3000');

    this.socket.on('connect', () => {
      this.socket.emit('join_order_payment_room', {
        userId,
        paymentId,
      });
    });

    this.socket.on('order_payment_status_update', (data) => {
      this.updatePaymentStatus(data.status);
    });

    this.socket.on('order_payment_success', (data) => {
      this.handlePaymentSuccess(data);
    });

    this.socket.on('order_payment_error', (data) => {
      this.handlePaymentError(data);
    });
  }

  private updatePaymentStatus(status: string) {
    console.log('Статус платежа:', status);
    // Обновляем UI
  }

  private handlePaymentSuccess(data: any) {
    console.log('Оплата успешна!', data);
    // Показываем уведомление об успехе
    // Обновляем список заказов
  }

  private handlePaymentError(data: any) {
    console.log('Ошибка оплаты:', data.error);
    // Показываем уведомление об ошибке
  }

  disconnect() {
    this.socket.disconnect();
  }
}

// Использование:
const tracker = new OrderPaymentTracker(paymentId, userId);
```

### 5. Полный пример интеграции

```typescript
class OrderService {
  private baseUrl = 'http://localhost:3000';
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async createOrderWithPayment(orderData: CreateOrderRequest): Promise<void> {
    try {
      // 1. Создаем заказ
      const order = await this.createOrder(orderData);
      console.log('Заказ создан:', order);

      // 2. Создаем платеж
      const payment = await this.createPaymentLink({
        orderId: order.id,
        amount: order.price,
      });
      console.log('Платеж создан:', payment);

      // 3. Открываем форму оплаты
      this.openPaymentForm(payment.paymentUrl);

      // 4. Отслеживаем статус (опционально)
      if (payment.paymentId) {
        this.trackPayment(payment.paymentId, order.customer.id);
      }
    } catch (error) {
      console.error('Ошибка создания заказа:', error);
    }
  }

  private async createOrder(data: CreateOrderRequest) {
    const response = await fetch(`${this.baseUrl}/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error('Ошибка создания заказа');
    }

    return response.json();
  }

  private async createPaymentLink(data: CreatePaymentRequest) {
    const response = await fetch(`${this.baseUrl}/orders/payment/create`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error('Ошибка создания платежа');
    }

    return response.json();
  }

  private openPaymentForm(paymentUrl: string) {
    const paymentWindow = window.open(
      paymentUrl,
      'payment',
      'width=600,height=700,scrollbars=yes,resizable=yes',
    );

    // Отслеживаем закрытие окна
    const checkClosed = setInterval(() => {
      if (paymentWindow?.closed) {
        clearInterval(checkClosed);
        this.refreshOrders();
      }
    }, 1000);
  }

  private trackPayment(paymentId: string, userId: string) {
    const tracker = new OrderPaymentTracker(paymentId, userId);

    // Отключаемся через 5 минут
    setTimeout(
      () => {
        tracker.disconnect();
      },
      5 * 60 * 1000,
    );
  }

  private async refreshOrders() {
    // Обновляем список заказов
    console.log('Обновляем список заказов...');
  }
}

// Использование:
const orderService = new OrderService(userToken);

orderService.createOrderWithPayment({
  customerId: 'user-uuid',
  address: 'ул. Пушкина, д. 10, кв. 5',
  description: 'Вынос мусора после ремонта',
  // price: 200.0, // Фиксированная цена, не нужно передавать
  paymentMethod: 'online',
});
```

## ⚙️ Настройка переменных окружения

Для работы на разных доменах (localhost/production) используйте переменную `BASE_URL`:

```bash
# Для локальной разработки
BASE_URL=http://localhost:3000

# Для продакшена
BASE_URL=https://cleanhouse123-cleanhouseapi-209c.twc1.net
```

**Важно:** WebSocket соединения автоматически адаптируются:

- `http://localhost:3000` → `ws://localhost:3000`
- `https://yourdomain.com` → `wss://yourdomain.com`

## 🚀 Примеры для фронтенда

### Простой пример создания заказа с оплатой

```typescript
// 1. Создаем заказ
const orderResponse = await fetch('/orders', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    customerId: 'user-uuid',
    address: 'ул. Пушкина, д. 10, кв. 5',
    description: 'Вынос мусора после ремонта',
    paymentMethod: 'online',
  }),
});

const order = await orderResponse.json();

// 2. Создаем ссылку на оплату
const paymentResponse = await fetch('/orders/payment/create', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    orderId: order.id,
    amount: 200.0,
  }),
});

const payment = await paymentResponse.json();

// 3. Открываем форму оплаты
window.open(payment.paymentUrl, 'payment', 'width=600,height=700');
```

### Отслеживание статуса заказа

```typescript
// Проверяем статус заказа после оплаты
async function checkOrderStatus(orderId: string) {
  const response = await fetch(`/orders/${orderId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const order = await response.json();

  switch (order.status) {
    case 'NEW':
      console.log('Заказ создан, ожидает оплаты');
      break;
    case 'PAID':
      console.log('Заказ оплачен, ожидает курьера');
      break;
    case 'ASSIGNED':
      console.log('Заказ назначен курьеру');
      break;
    case 'IN_PROGRESS':
      console.log('Заказ выполняется');
      break;
    case 'DONE':
      console.log('Заказ выполнен');
      break;
    case 'CANCELED':
      console.log('Заказ отменен');
      break;
  }
}
```

## Особенности формы оплаты

### Автозаполнение (для разработки)

На localhost форма автоматически заполняется тестовыми данными:

- Номер карты: `1234 5678 9012 3456`
- Срок действия: `12/25`
- CVV: `123`
- Имя держателя: `TEST USER`

### Форматирование полей

- **Номер карты:** автоматически добавляются пробелы (1234 5678 9012 3456)
- **Срок действия:** автоматически добавляется слеш (MM/YY)
- **CVV:** только цифры, максимум 4 символа
- **Имя держателя:** автоматически переводится в верхний регистр

### Безопасность

- Все данные защищены SSL-шифрованием
- Форма работает только с валидными paymentId
- WebSocket подключение только к авторизованным комнатам

## 📋 Обновленные эндпоинты

### Основные эндпоинты заказов

```http
# Создание заказа (фиксированная цена 200₽)
POST /orders
Authorization: Bearer <token>
Content-Type: application/json

{
  "customerId": "uuid",
  "address": "адрес",
  "description": "описание",
  "scheduledAt": "2024-01-15T10:00:00Z",
  "notes": "заметки",
  "paymentMethod": "online"
}

# Получение заказа
GET /orders/{orderId}
Authorization: Bearer <token>

# Обновление статуса заказа
PATCH /orders/{orderId}/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "PAID" | "ASSIGNED" | "IN_PROGRESS" | "DONE" | "CANCELED",
  "currierId": "uuid" // только для ASSIGNED
}
```

### Эндпоинты оплаты

```http
# Создание ссылки на оплату
POST /orders/payment/create
Authorization: Bearer <token>
Content-Type: application/json

{
  "orderId": "uuid",
  "amount": 200.0
}

# Форма оплаты (публичный)
GET /order-payment/{paymentId}

# Симуляция оплаты (публичный, для тестов)
POST /orders/payment/simulate/{paymentId}

# Получение информации о платеже
GET /orders/payment/{paymentId}
Authorization: Bearer <token>

# Callback для обработки платежа (публичный)
POST /orders/payment/callback
Content-Type: application/json

{
  "paymentId": "uuid",
  "status": "success" | "failed"
}
```

## Тестирование

### Симуляция платежа

Для тестирования можно использовать эндпоинт:

```http
POST /orders/payment/simulate/{paymentId}
```

Этот эндпоинт публичный и не требует авторизации.

### Проверка статуса платежа

```http
GET /orders/payment/{paymentId}
Authorization: Bearer <access_token>
```

## Обработка ошибок

### Возможные ошибки:

1. **Заказ не найден** - при создании платежа
2. **Платеж не найден** - при обращении к несуществующему платежу
3. **Платеж уже обработан** - при попытке оплатить уже оплаченный заказ
4. **Ошибка WebSocket** - проблемы с подключением

### Рекомендации:

- Всегда проверяйте статус ответа HTTP
- Обрабатывайте ошибки WebSocket подключения
- Предусмотрите fallback для случаев, когда WebSocket недоступен
- Логируйте все ошибки для отладки

## Заключение

Обновленная система оплаты заказов предоставляет:

- ✅ **Упрощенный API** для создания заказов и платежей
- ✅ **Упрощенную форму оплаты** без лишних шагов
- ✅ **WebSocket уведомления** в реальном времени
- ✅ **Корректное обновление** статуса заказа (NEW → PAID → ASSIGNED)
- ✅ **Синхронизацию** между памятью и базой данных
- ✅ **Безопасность** и защиту данных
- ✅ **Удобство тестирования** с симуляцией платежей

### Ключевые улучшения:

- 🆕 Добавлен статус `PAID` для четкого разделения оплаченных заказов
- 🔄 Упрощена форма оплаты - убраны лишние экраны подтверждения
- 💾 Платежи сохраняются в базе данных
- 🎯 Исправлена логика обновления статусов
- 🕐 Настроен часовой пояс Europe/Moscow для корректного времени (проверено ✅)
- 📅 Добавлен TimezoneInterceptor для корректного отображения дат в московском времени
- 🌐 Настроена переменная BASE_URL для работы на разных доменах (localhost/production)

Фронтенд разработчик может легко интегрировать эту систему, следуя обновленному флоу!
