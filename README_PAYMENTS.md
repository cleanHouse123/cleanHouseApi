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
  "amount": 150000  // в копейках (1500 рублей)
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
  "subscriptionId": "uuid",
  "subscriptionType": "monthly",
  "planId": "uuid",
  "amount": 100000  // в копейках (1000 рублей)
}

Response:
{
  "paymentUrl": "https://yoomoney.ru/checkout/...",
  "paymentId": "uuid",
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

### Платежи заказов (Payment)

```typescript
{
  id: string; // UUID платежа
  orderId: string; // UUID заказа
  amount: number; // Сумма в копейках
  status: PaymentStatus; // pending, paid, failed, canceled
  method: PaymentMethod; // online, subscription
  yookassaId: string; // ID в системе YooKassa
  createdAt: Date;
}
```

### Платежи подписок (SubscriptionPayment)

```typescript
{
  id: string;                    // UUID платежа
  subscriptionId: string;        // UUID подписки
  amount: number;                // Сумма в копейках
  subscriptionType: string;      // monthly, yearly
  status: SubscriptionPaymentStatus; // pending, success, failed, refunded
  yookassaId: string;           // ID в системе YooKassa
  paymentUrl: string;           // URL для оплаты
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

### Простой flow без WebSocket'ов

```javascript
// 1. Создание платежа
const createPayment = async (orderId, amount) => {
  const response = await fetch('/orders/payment/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ orderId, amount }),
  });

  const { paymentUrl, paymentId } = await response.json();

  // 2. Перенаправление на оплату
  window.location.href = paymentUrl;
};

// 3. Проверка статуса после возврата
const checkPaymentStatus = async (paymentId) => {
  const response = await fetch(`/payment-status/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const payment = await response.json();
  return payment.status; // 'paid', 'pending', 'failed'
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

- **Фронтенд/API**: сумма в копейках (integer)
- **YooKassa API**: сумма в рублях (string с 2 знаками)
- **Конвертация**: `(amount / 100).toFixed(2)`

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

### Оставлено только необходимое:

- ✅ Прямые HTTP API для создания платежей
- ✅ Единый webhook обработчик
- ✅ Простая проверка статусов
- ✅ Автоматическое обновление через webhook'и

Эта упрощенная архитектура надежнее и проще в поддержке, убирает зависимости от WebSocket соединений и сложной синхронизации состояний.
