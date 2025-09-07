# Система заказов с онлайн-оплатой

## Обзор

Система заказов Clean House позволяет клиентам создавать заказы на вынос мусора и оплачивать их онлайн через красивую форму с WebSocket уведомлениями в реальном времени.

## Архитектура системы

### Основные компоненты:
- **Order** - основная сущность заказа
- **Payment** - платеж по заказу (в базе данных)
- **OrderPaymentService** - сервис для управления платежами в памяти
- **OrderPaymentGateway** - WebSocket для уведомлений
- **OrderPaymentPageController** - контроллер формы оплаты

### Статусы заказа:
- `NEW` - новый заказ
- `ASSIGNED` - назначен курьеру (после оплаты)
- `IN_PROGRESS` - выполняется
- `DONE` - выполнен
- `CANCELED` - отменен

## Полный флоу оплаты заказа

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
  "price": 500.00,
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
  "price": 500.00,
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
  "amount": 500.0
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

Пользователь переходит по ссылке `paymentUrl`, открывается форма оплаты с:
- Полем для номера карты (автоформатирование)
- Полем для срока действия (MM/YY)
- Полем для CVV
- Полем для имени держателя карты
- Кнопкой "Подтвердить данные карты"

### 4. Подтверждение оплаты

При нажатии "Подтвердить данные карты":
1. Показывается экран подтверждения с деталями платежа
2. Кнопки "✅ Подтвердить оплату" и "❌ Отменить"
3. При подтверждении отправляется запрос на симуляцию

### 5. WebSocket подключение

При загрузке формы автоматически:
```javascript
const socket = io('http://localhost:3000');

socket.on('connect', () => {
  socket.emit('join_order_payment_room', { 
    userId: 'user-id', 
    paymentId: 'payment-uuid' 
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
- Статус заказа меняется с `NEW` на `ASSIGNED`
- Заказ готов к назначению курьера

## Реализация на фронтенде

### 1. Создание заказа

```typescript
interface CreateOrderRequest {
  customerId: string;
  address: string;
  description?: string;
  price: number;
  scheduledAt?: string;
  notes?: string;
  paymentMethod: 'online' | 'cash' | 'card';
}

async function createOrder(orderData: CreateOrderRequest): Promise<OrderResponse> {
  const response = await fetch('/orders', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(orderData)
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

async function createPaymentLink(paymentData: CreatePaymentRequest): Promise<PaymentResponse> {
  const response = await fetch('/orders/payment/create', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(paymentData)
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
    'width=600,height=700,scrollbars=yes,resizable=yes'
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
        paymentId 
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
        amount: order.price
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
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
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
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
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
      'width=600,height=700,scrollbars=yes,resizable=yes'
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
    setTimeout(() => {
      tracker.disconnect();
    }, 5 * 60 * 1000);
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
  price: 500.0,
  paymentMethod: 'online'
});
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

Система оплаты заказов предоставляет:
- ✅ **Простой API** для создания заказов и платежей
- ✅ **Красивую форму оплаты** с валидацией
- ✅ **WebSocket уведомления** в реальном времени
- ✅ **Автоматическое обновление** статуса заказа
- ✅ **Безопасность** и защиту данных
- ✅ **Удобство тестирования** с симуляцией платежей

Фронтенд разработчик может легко интегрировать эту систему, следуя описанному флоу.
