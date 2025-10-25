# Система платежей YooKassa

Документация по интеграции платежной системы YooKassa в Clean House API.

## 🏗️ Архитектура платежей

### Основные компоненты

1. **Order Payment Service** (`src/order/services/order-payment.service.ts`)
   - Создание платежей для заказов
   - Обработка статусов платежей заказов

2. **Subscription Payment Service** (`src/subscription/services/payment.service.ts`)
   - Создание платежей для подписок
   - Обработка статусов платежей подписок

3. **Webhook Controller** (`src/shared/controllers/webhook.controller.ts`)
   - Единый обработчик всех webhook'ов от YooKassa
   - Автоматическое определение типа платежа (заказ/подписка)

4. **Payment Status Controller** (`src/shared/controllers/payment-status.controller.ts`)
   - Проверка статуса любого платежа
   - Универсальный поиск по заказам и подпискам

## 🔄 Упрощенный Flow платежей

### 1. Создание платежа

**Для заказов:**

```
POST /orders/payment/create
{
  "orderId": "uuid",
  "amount": 20000  // в копейках (200 рублей)
}

Response:
{
  "paymentUrl": "https://yoomoney.ru/checkout/...",
  "paymentId": "uuid",
  "status": "pending"
}
```

**Для подписок:**

```
POST /subscriptions/payment/create
{
  "subscriptionId": "ff11450c-6f20-4813-bccd-53a8bbae615b",
  "subscriptionType": "yearly",
  "planId": "cc93f854-9af3-450c-82dd-d20343334cc6",
  "amount": 960000  // в копейках (9600 рублей)
}

Response:
{
  "paymentUrl": "https://yoomoney.ru/checkout/payments/v2/contract?orderId=...",
  "paymentId": "2300dc72-8421-482f-96ce-c3e4ef5d273d",
  "status": "pending"
}
```

### 2. Прямой редирект на фронтенд

**YooKassa настроена на возврат сразу на фронтенд:**

- **Заказы**: `FRONTEND_URL/payment/result?paymentId=xxx&type=order`
- **Подписки**: `FRONTEND_URL/payment/result?paymentId=xxx&type=subscription`

### 3. Обработка на фронтенде

```javascript
// На странице /payment/result
const urlParams = new URLSearchParams(window.location.search);
const paymentId = urlParams.get('paymentId');
const type = urlParams.get('type'); // 'order' или 'subscription'

// Показываем "Обработка платежа..."
showProcessingState();

// Проверяем статус каждые 2 секунды
const checkStatus = setInterval(async () => {
  const status = await fetch(`/payment-status/${paymentId}`);
  const payment = await status.json();

  if (payment.status === 'paid' || payment.status === 'success') {
    clearInterval(checkStatus);
    showSuccess('Платеж успешен!');
    redirectToApp();
  } else if (payment.status === 'failed') {
    clearInterval(checkStatus);
    showError('Ошибка платежа');
  }
}, 2000);
```

### 4. Автоматическое обновление через webhook'и

Пока пользователь на странице результата, webhook'и от YooKassa обновляют статус в БД:

```typescript
// Webhook обработчик автоматически определяет тип
const { orderId, subscriptionId } = webhookData.object.metadata;

if (subscriptionId) {
  await this.subscriptionPaymentService.updateStatus(paymentId, 'success');
} else if (orderId) {
  await this.orderPaymentService.updateStatus(paymentId, 'paid');
}
```

## 📊 Структура данных

### ⚠️ ВАЖНО для фронтенда: Все суммы теперь возвращаются как числа!

**До исправления:**

```json
{
  "price": "200.00", // ❌ строка
  "amount": "20000" // ❌ строка
}
```

**После исправления:**

```json
{
  "price": 200.0, // ✅ число
  "amount": 20000 // ✅ число
}
```

### Заказы (Order)

```typescript
{
  id: string;
  customer: User;
  address: string;
  description?: string;
  price: number;        // ✅ ЧИСЛО в рублях (например: 200.00)
  status: OrderStatus;  // new, paid, in_progress, completed, canceled
  paymentUrl?: string;  // ✅ Ссылка на оплату (для неоплаченных заказов)
  payments: Payment[];
  createdAt: Date;
}
```

### Платежи заказов (Payment)

```typescript
{
  id: string;           // UUID платежа
  orderId: string;      // UUID заказа
  amount: number;       // ✅ ЧИСЛО в копейках (например: 20000)
  status: PaymentStatus; // pending, paid, failed, refunded
  method: PaymentMethod; // cash, card, online, subscription
  yookassaId?: string;  // ID в системе YooKassa
  createdAt: Date;
}
```

### Подписки (Subscription)

```typescript
{
  id: string;
  userId: string;
  type: SubscriptionType; // monthly, yearly, one_time
  status: SubscriptionStatus; // pending, active, expired, canceled
  price: number; // ✅ ЧИСЛО в рублях (например: 299.00)
  startDate: Date;
  endDate: Date;
  createdAt: Date;
}
```

### Платежи подписок (SubscriptionPayment)

```typescript
{
  id: string;                    // UUID платежа
  subscriptionId: string;        // UUID подписки
  amount: number;                // ✅ ЧИСЛО в копейках (например: 29900)
  subscriptionType?: string;     // monthly, yearly
  status: SubscriptionPaymentStatus; // pending, success, failed, refunded
  yookassaId?: string;          // ID в системе YooKassa
  paymentUrl?: string;          // URL для оплаты
  createdAt: Date;
  paidAt?: Date;
}
```

## 🔧 Конфигурация YooKassa

### Переменные окружения

```env
YOOKASSA_SHOP_ID=123456
YOOKASSA_SECRET_KEY=live_xxx или test_xxx
NODE_ENV=production  # для режима работы
```

### Настройка webhook'ов

В личном кабинете YooKassa указать **один URL**:

```
https://your-domain.com/webhooks/yookassa
```

События для обработки:

- `payment.succeeded` - успешная оплата
- `payment.canceled` - отмена/ошибка оплаты
- `refund.succeeded` - возврат средств

## 🚀 API Endpoints

### Создание платежей

- `POST /orders/payment/create` - платеж заказа
- `POST /subscriptions/payment/create` - платеж подписки

### Проверка статусов

- `GET /orders/payment/status/:paymentId` - статус платежа заказа
- `GET /subscriptions/payment/status/:paymentId` - статус платежа подписки
- `GET /payment-status/:paymentId` - универсальная проверка

### Webhook'и

- `POST /webhooks/yookassa` - обработка уведомлений YooKassa

### Страницы возврата (устарели)

- ~~`GET /order-payment/yookassa-return`~~ - больше не используется
- ~~`GET /subscription-payment/yookassa-return`~~ - больше не используется

**Теперь YooKassa редиректит сразу на фронтенд!**

## 💻 Использование на фронтенде

### ✅ Новый упрощенный flow для заказов

```javascript
// 1. Создание заказа (автоматически создается ссылка на оплату)
const createOrder = async (customerId, address, description) => {
  const response = await fetch('/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      customerId,
      address,
      description,
      paymentMethod: 'online',
    }),
  });

  const order = await response.json();
  // order.paymentUrl уже содержит ссылку на оплату!

  return order;
};

// 2. Создание ссылки на оплату для существующего заказа
const createPaymentUrlForOrder = async (orderId) => {
  const response = await fetch(`/orders/${orderId}/create-payment-url`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json();
  return result; // { paymentUrl: "...", message: "..." }
};

// 3. Показ ссылки на оплату в любой момент
const showPaymentLink = async (order) => {
  let paymentUrl = order.paymentUrl;

  // Если нет ссылки, создаем её
  if (order.status === 'new' && !paymentUrl) {
    const result = await createPaymentUrlForOrder(order.id);
    paymentUrl = result.paymentUrl;
  }

  if (order.status === 'new' && paymentUrl) {
    return (
      <button onClick={() => (window.location.href = paymentUrl)}>
        Оплатить заказ {order.price} ₽
      </button>
    );
  }
  return null;
};
```

### Полный flow с реальными примерами

```javascript
// 1. Создание подписки
const createSubscription = async (userId, type, price, startDate, endDate) => {
  const response = await fetch('/subscriptions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      userId: '4abf56cd-ed2c-4d08-87a6-e31db9b77ef2',
      type: 'yearly',
      price: 9600, // в рублях
      startDate: '2025-10-25T14:00:25.000',
      endDate: '2026-10-25T14:00:25.000',
    }),
  });

  const subscription = await response.json();
  return subscription; // { id: "ff11450c-6f20-4813-bccd-53a8bbae615b", ... }
};

// 2. Создание платежа для заказа (единый стандарт!)
const createOrderPayment = async (orderId) => {
  const response = await fetch('/orders/payment/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      orderId: '739c65f2-383d-4272-a8d4-ca88d7c2a54e',
      amount: 20000, // в копейках (200 рублей)
    }),
  });

  const payment = await response.json();
  window.location.href = payment.paymentUrl;
};

// 3. Создание платежа для подписки (единый стандарт!)
const createSubscriptionPayment = async (subscriptionId, planId) => {
  const response = await fetch('/subscriptions/payment/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      subscriptionId: 'ff11450c-6f20-4813-bccd-53a8bbae615b',
      subscriptionType: 'yearly',
      planId: 'cc93f854-9af3-450c-82dd-d20343334cc6',
      amount: 960000, // в копейках (9600 рублей)
    }),
  });

  const payment = await response.json();
  window.location.href = payment.paymentUrl;
};

// 4. Проверка статуса после возврата
const checkPaymentStatus = async (paymentId) => {
  const response = await fetch(`/payment-status/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const payment = await response.json();
  return payment.status; // 'success', 'pending', 'failed'
};
```

### Страница результата платежа

```javascript
// /payment/result - единая страница для всех типов платежей
const PaymentResult = () => {
  const [status, setStatus] = useState('processing');
  const urlParams = new URLSearchParams(window.location.search);
  const paymentId = urlParams.get('paymentId');
  const type = urlParams.get('type'); // 'order' или 'subscription'

  useEffect(() => {
    if (!paymentId) {
      setStatus('error');
      return;
    }

    // Проверяем статус каждые 2 секунды
    const checkStatus = setInterval(async () => {
      try {
        const response = await fetch(`/payment-status/${paymentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payment = await response.json();

        if (payment.status === 'paid' || payment.status === 'success') {
          clearInterval(checkStatus);
          setStatus('success');

          // Перенаправляем через 3 секунды
          setTimeout(() => {
            const redirectPath =
              type === 'subscription' ? '/subscriptions' : '/orders';
            navigate(redirectPath);
          }, 3000);
        } else if (
          payment.status === 'failed' ||
          payment.status === 'canceled'
        ) {
          clearInterval(checkStatus);
          setStatus('error');
        }
      } catch (error) {
        console.error('Ошибка проверки статуса:', error);
      }
    }, 2000);

    return () => clearInterval(checkStatus);
  }, [paymentId]);

  return (
    <div className="payment-result">
      {status === 'processing' && (
        <div>
          <Spinner />
          <h1>Обработка платежа...</h1>
          <p>Пожалуйста, подождите</p>
        </div>
      )}

      {status === 'success' && (
        <div>
          <SuccessIcon />
          <h1>Платеж успешен!</h1>
          <p>Перенаправление...</p>
        </div>
      )}

      {status === 'error' && (
        <div>
          <ErrorIcon />
          <h1>Ошибка платежа</h1>
          <button onClick={() => navigate('/orders')}>
            Вернуться к заказам
          </button>
        </div>
      )}
    </div>
  );
};
```

## 🔍 Отладка и мониторинг

### Логи платежей

```bash
# Просмотр логов webhook'ов
docker logs -f container_name | grep "webhook"

# Логи создания платежей
docker logs -f container_name | grep "YooKassa payment"
```

### Проверка конфигурации

```bash
# Проверка переменных окружения
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/health
```

### Тестирование платежей

```bash
# Создание тестового платежа
curl -X POST http://localhost:3000/orders/payment/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"orderId":"test-uuid","amount":100}'
```

## ⚠️ Важные особенности

### Конвертация сумм

- **Фронтенд → API**: сумма в копейках (integer)
- **API → Фронтенд**: все суммы как числа (не строки!)
- **API → YooKassa**: сумма в рублях как число
- **Конвертация**: `amount / 100` → `9600`

### ✅ Единый стандарт: ВСЕ платежи в копейках

```javascript
// Подписка создается в РУБЛЯХ (только для создания entity)
const subscription = {
  price: 9600, // рубли
};

// ВСЕ платежи создаются в КОПЕЙКАХ (единый стандарт!)
const orderPayment = {
  amount: 20000, // копейки (200 рублей)
};

const subscriptionPayment = {
  amount: 960000, // копейки (9600 рублей)
};

// Backend конвертирует ВСЕ суммы одинаково
const yookassaAmount = amount / 100; // копейки → рубли
```

### Работа с суммами на фронтенде

```javascript
// ✅ Правильно - суммы теперь числа
const order = await fetch('/orders/123').then((r) => r.json());
console.log(typeof order.price); // "number" (было "string")
console.log(order.price); // 200.00 (было "200.00")

const payment = order.payments[0];
console.log(typeof payment.amount); // "number" (было "string")
console.log(payment.amount); // 20000 (было "20000")

// Можно сразу использовать в вычислениях
const totalPrice = order.price * 1.2; // ✅ работает без parseInt/parseFloat
const amountInRubles = payment.amount / 100; // ✅ сразу число

// Форматирование для отображения
const formatPrice = (price) => `${price.toFixed(2)} ₽`;
const formatAmount = (amount) => `${(amount / 100).toFixed(2)} ₽`;
```

### Тестовый режим

- В тестовом режиме YooKassa может не передавать параметры в return_url
- Статус платежа всегда проверяется через webhook'и
- Используйте тестовые карты из документации YooKassa

### Безопасность

- Все webhook'и проверяются на подлинность
- Платежи привязаны к пользователям через JWT
- Суммы валидируются на backend'е

## 🎯 Упрощения в архитектуре

### Убрано из системы:

- ❌ WebSocket'ы для real-time уведомлений
- ❌ Сложная система событий
- ❌ Gateway'и для уведомлений
- ❌ Множественные контроллеры для одного типа операций
- ❌ Промежуточные серверные страницы возврата

### Оставлено только необходимое:

- ✅ Прямые HTTP API для создания платежей
- ✅ Единый webhook обработчик
- ✅ Простая проверка статусов
- ✅ Автоматическое обновление через webhook'и
- ✅ Прямой редирект на фронтенд после оплаты

### Исправлено для фронтенда:

- ✅ **Все суммы теперь числа** вместо строк
- ✅ **Упрощенный flow** - один URL для результата платежа
- ✅ **Polling вместо WebSocket'ов** - проще и надежнее
- ✅ **Единая обработка** заказов и подписок

## 🚀 Миграция для фронтенда

### Что нужно изменить:

1. **Убрать парсинг строк в числа:**

```javascript
// ❌ Старый код
const price = parseFloat(order.price);
const amount = parseInt(payment.amount);

// ✅ Новый код
const price = order.price; // уже число
const amount = payment.amount; // уже число
```

2. **Создать страницу `/payment/result`** для обработки возврата с YooKassa

3. **Использовать polling** вместо WebSocket'ов для проверки статуса

Эта упрощенная архитектура надежнее и проще в поддержке, убирает зависимости от WebSocket соединений и сложной синхронизации состояний.
