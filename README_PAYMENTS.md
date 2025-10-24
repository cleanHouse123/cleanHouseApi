# Интеграция YooKassa платежей

Документация по настройке и использованию платежной системы YooKassa в приложении Clean House.

## 🚀 Быстрый старт для фронтенда

### Важно! Не используйте iframe для оплаты

**❌ Неправильно:**

```javascript
// НЕ ДЕЛАЙТЕ ТАК - iframe не поддерживается YooKassa
const iframe = document.createElement('iframe');
iframe.src = paymentUrl;
```

**✅ Правильно:**

```javascript
// Прямое перенаправление на страницу оплаты
window.location.href = paymentUrl;
// или
window.open(paymentUrl, '_blank');
```

### Пример интеграции для React/React Native

```javascript
// 1. Создание платежа
const createPayment = async (orderId, amount) => {
  try {
    const response = await fetch('/orders/payment/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ orderId, amount }),
    });

    const data = await response.json();
    return data; // { paymentUrl, paymentId, status }
  } catch (error) {
    console.error('Ошибка создания платежа:', error);
  }
};

// 2. Перенаправление на оплату
const handlePayment = async () => {
  const payment = await createPayment(orderId, 1500);

  if (payment?.paymentUrl) {
    // Прямое перенаправление - ЕДИНСТВЕННЫЙ правильный способ
    window.location.href = payment.paymentUrl;
  }
};

// 3. Проверка статуса после возврата
const checkPaymentStatus = async (paymentId) => {
  const response = await fetch(`/orders/payment/status/${paymentId}`);
  const status = await response.json();
  return status; // { status: 'paid|pending|failed' }
};
```

### Flow оплаты

1. **Создание платежа** → получение `paymentUrl`
2. **Перенаправление** → `window.location.href = paymentUrl`
3. **Оплата на YooKassa** → пользователь вводит данные карты
4. **Возврат на сервер** → YooKassa перенаправляет на `/order-payment/success/:paymentId`
5. **Обработка на сервере** → автоматическое обновление статуса платежа
6. **Редирект на фронтенд** → `http://localhost:5173/payment-return?paymentId=xxx`

### ⚠️ Особенности тестового режима

В тестовом режиме YooKassa может не передавать параметры через return_url. В этом случае:

1. После оплаты пользователь увидит страницу с кнопкой "Вернуться в приложение"
2. При нажатии на кнопку произойдет переход на фронтенд без `paymentId`
3. Фронтенд должен проверить статус последнего платежа через API или показать общее сообщение об успешной оплате

### 🔗 Настройка webhook'ов в YooKassa

В личном кабинете YooKassa → **Интеграция → HTTP-уведомления** указать **ОДИН URL**:

```
https://your-domain.com/webhooks/yookassa
```

**Поддерживаемые события YooKassa:**

- ✅ `payment.succeeded` - Успешный платеж
- ✅ `payment.waiting_for_capture` - Платеж ожидает подтверждения
- ✅ `payment.canceled` - Отмена платежа или ошибка оплаты
- ✅ `refund.succeeded` - Успешный возврат денег

**Автоматическое определение типа платежа:**

- **Заказы** - если есть `orderId` и `paymentId` в metadata
- **Подписки** - если есть `subscriptionId` и `paymentId` в metadata

**Один URL для всех типов событий и платежей!** 🎯

### WebSocket уведомления (опционально)

```javascript
import io from 'socket.io-client';

const socket = io('ws://localhost:4000/order-payment');

// Подключение к комнате платежа
socket.emit('join_order_payment_room', {
  userId: 'user-id',
  paymentId: 'payment-id',
});

// Обработка успешной оплаты
socket.on('order_payment_success', (data) => {
  console.log('Платеж успешен:', data);
  // Обновить UI, показать успех
});

// Обработка ошибки оплаты
socket.on('order_payment_error', (data) => {
  console.log('Ошибка платежа:', data);
  // Показать ошибку пользователю
});
```

### Для React Native приложений

```javascript
import { Linking } from 'react-native';

// Создание и обработка платежа
const handlePayment = async () => {
  try {
    const payment = await createPayment(orderId, amount);

    if (payment?.paymentUrl) {
      // Открытие внешнего браузера для оплаты
      const supported = await Linking.canOpenURL(payment.paymentUrl);

      if (supported) {
        await Linking.openURL(payment.paymentUrl);

        // Сохраняем paymentId для проверки статуса
        await AsyncStorage.setItem('pendingPaymentId', payment.paymentId);

        // Запускаем периодическую проверку статуса
        startPaymentStatusCheck(payment.paymentId);
      }
    }
  } catch (error) {
    console.error('Ошибка оплаты:', error);
  }
};

// Периодическая проверка статуса платежа
const startPaymentStatusCheck = (paymentId) => {
  const interval = setInterval(async () => {
    try {
      const status = await checkPaymentStatus(paymentId);

      if (status.status === 'paid') {
        clearInterval(interval);
        await AsyncStorage.removeItem('pendingPaymentId');
        // Показать успех и обновить UI
        showPaymentSuccess();
      } else if (status.status === 'failed') {
        clearInterval(interval);
        await AsyncStorage.removeItem('pendingPaymentId');
        // Показать ошибку
        showPaymentError();
      }
    } catch (error) {
      console.error('Ошибка проверки статуса:', error);
    }
  }, 3000); // Проверяем каждые 3 секунды

  // Останавливаем через 5 минут
  setTimeout(() => clearInterval(interval), 300000);
};

// При возврате в приложение (AppState change)
useEffect(() => {
  const handleAppStateChange = async (nextAppState) => {
    if (nextAppState === 'active') {
      const pendingPaymentId = await AsyncStorage.getItem('pendingPaymentId');
      if (pendingPaymentId) {
        // Проверяем статус при возврате в приложение
        const status = await checkPaymentStatus(pendingPaymentId);
        if (status.status === 'paid') {
          await AsyncStorage.removeItem('pendingPaymentId');
          showPaymentSuccess();
        }
      }
    }
  };

  const subscription = AppState.addEventListener(
    'change',
    handleAppStateChange,
  );
  return () => subscription?.remove();
}, []);
```

### Для веб-приложений с SPA роутингом

```javascript
// Для Next.js, React Router и других SPA
const handlePayment = async () => {
  const payment = await createPayment(orderId, amount);

  if (payment?.paymentUrl) {
    // Сохраняем текущий URL для возврата
    sessionStorage.setItem('returnUrl', window.location.pathname);
    sessionStorage.setItem('pendingPaymentId', payment.paymentId);

    // Перенаправляем на оплату
    window.location.href = payment.paymentUrl;
  }
};

// В компоненте success страницы или при загрузке приложения
useEffect(() => {
  const checkPendingPayment = async () => {
    const pendingPaymentId = sessionStorage.getItem('pendingPaymentId');
    const returnUrl = sessionStorage.getItem('returnUrl');

    if (pendingPaymentId) {
      const status = await checkPaymentStatus(pendingPaymentId);

      if (status.status === 'paid') {
        sessionStorage.removeItem('pendingPaymentId');
        sessionStorage.removeItem('returnUrl');

        // Показываем успех и возвращаемся
        showPaymentSuccess();
        if (returnUrl) {
          router.push(returnUrl);
        }
      }
    }
  };

  checkPendingPayment();
}, []);
```

### Обработка возврата без paymentId (тестовый режим)

```javascript
// Компонент страницы возврата
const PaymentReturn = () => {
  const [status, setStatus] = useState('checking');
  const searchParams = new URLSearchParams(window.location.search);
  const paymentId = searchParams.get('paymentId');
  const error = searchParams.get('error');
  const type = searchParams.get('type'); // 'subscription' для подписок

  useEffect(() => {
    const handleReturn = async () => {
      if (error) {
        setStatus('error');
        return;
      }

      if (paymentId) {
        // Есть paymentId - проверяем конкретный платеж
        try {
          const endpoint =
            type === 'subscription'
              ? `/subscription-payment/status/${paymentId}`
              : `/order-payment/status/${paymentId}`;

          const response = await fetch(endpoint);
          const result = await response.json();

          setStatus(result.status === 'paid' ? 'success' : 'pending');
        } catch (error) {
          console.error('Ошибка проверки статуса:', error);
          setStatus('error');
        }
      } else {
        // Нет paymentId - проверяем последний платеж или показываем общее сообщение
        const pendingPaymentId = sessionStorage.getItem('pendingPaymentId');

        if (pendingPaymentId) {
          try {
            const endpoint =
              type === 'subscription'
                ? `/subscription-payment/status/${pendingPaymentId}`
                : `/order-payment/status/${pendingPaymentId}`;

            const response = await fetch(endpoint);
            const result = await response.json();

            if (result.status === 'paid') {
              sessionStorage.removeItem('pendingPaymentId');
              setStatus('success');
            } else {
              setStatus('pending');
            }
          } catch (error) {
            console.error('Ошибка проверки статуса:', error);
            setStatus('success'); // Показываем успех, так как пользователь вернулся
          }
        } else {
          // Нет сохраненного paymentId - показываем общее сообщение
          setStatus('success');
        }
      }
    };

    handleReturn();
  }, [paymentId, error, type]);

  if (status === 'checking') {
    return <div>Проверяем статус оплаты...</div>;
  }

  if (status === 'error') {
    return (
      <div>
        <h2>Ошибка оплаты</h2>
        <p>Произошла ошибка при обработке платежа. Попробуйте еще раз.</p>
        <button onClick={() => window.history.back()}>Вернуться назад</button>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div>
        <h2>Оплата успешна!</h2>
        <p>
          {type === 'subscription'
            ? 'Подписка успешно оформлена.'
            : 'Заказ успешно оплачен.'}
        </p>
        <button onClick={() => (window.location.href = '/')}>
          Вернуться на главную
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2>Оплата в обработке</h2>
      <p>Платеж обрабатывается. Статус будет обновлен автоматически.</p>
    </div>
  );
};
```

### Обработка ошибок и edge cases

```javascript
const createPaymentWithRetry = async (orderId, amount, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const payment = await createPayment(orderId, amount);
      return payment;
    } catch (error) {
      console.error(`Попытка ${i + 1} неудачна:`, error);

      if (i === retries - 1) {
        throw new Error('Не удалось создать платеж после нескольких попыток');
      }

      // Ждем перед повторной попыткой
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
};

// Проверка доступности платежной системы
const isPaymentAvailable = async () => {
  try {
    const response = await fetch('/orders/payment/health');
    return response.ok;
  } catch {
    return false;
  }
};

// Полный пример с обработкой ошибок
const handlePaymentWithErrorHandling = async () => {
  try {
    // Проверяем доступность
    const available = await isPaymentAvailable();
    if (!available) {
      throw new Error('Платежная система временно недоступна');
    }

    // Создаем платеж с повторными попытками
    const payment = await createPaymentWithRetry(orderId, amount);

    if (!payment?.paymentUrl) {
      throw new Error('Не удалось получить ссылку на оплату');
    }

    // Перенаправляем
    window.location.href = payment.paymentUrl;
  } catch (error) {
    console.error('Ошибка оплаты:', error);

    // Показываем пользователю понятную ошибку
    showErrorMessage(
      'Не удалось перейти к оплате. Попробуйте позже или обратитесь в поддержку.',
    );
  }
};
```

## Настройка

### Переменные окружения

Добавьте в ваш `.env` файл:

```env
YOOKASSA_SHOP_ID=test_eS9e1DCN_Wuk-995eIgHdvGoAPa1SM2uqT2nYJRFCW0
YOOKASSA_SECRET_KEY=1188509
BASE_URL=http://localhost:3000
```

### Конфигурация

YooKassa модуль автоматически подключается в `app.module.ts` с использованием конфигурации из `src/shared/config/yookassa.config.ts`.

## API Endpoints

### Платежи для заказов

#### Создание платежа

```http
POST /orders/payment/create
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "orderId": "uuid-заказа",
  "amount": 1500.00
}
```

**Ответ:**

```json
{
  "paymentUrl": "https://yoomoney.ru/checkout/payments/v2/contract?orderId=...",
  "paymentId": "uuid-платежа",
  "status": "pending"
}
```

> **Примечание:** `paymentUrl` содержит ссылку на страницу оплаты YooKassa, куда нужно перенаправить пользователя

#### Проверка статуса платежа

```http
GET /orders/payment/status/{paymentId}
```

**Ответ:**

```json
{
  "id": "uuid-платежа",
  "orderId": "uuid-заказа",
  "amount": 1500.0,
  "status": "pending|paid|failed",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

#### Webhook для YooKassa

```http
POST /orders/payment/yookassa-webhook
Content-Type: application/json

{
  "type": "notification",
  "event": "payment.succeeded",
  "object": {
    "id": "yookassa-payment-id",
    "status": "succeeded",
    "metadata": {
      "orderId": "uuid-заказа",
      "paymentId": "uuid-платежа"
    }
  }
}
```

### Платежи для подписок

#### Создание платежа

```http
POST /subscriptions/payment/create
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "subscriptionId": "uuid-подписки",
  "amount": 999.00,
  "subscriptionType": "premium",
  "planId": "uuid-плана"
}
```

**Ответ:**

```json
{
  "paymentUrl": "https://yoomoney.ru/checkout/payments/v2/contract?orderId=...",
  "paymentId": "uuid-платежа",
  "status": "pending"
}
```

> **Примечание:** `paymentUrl` содержит ссылку на страницу оплаты YooKassa, куда нужно перенаправить пользователя

#### Проверка статуса платежа

```http
GET /subscriptions/payment/status/{paymentId}
Authorization: Bearer <JWT_TOKEN>
```

#### Webhook для YooKassa

```http
POST /subscriptions/payment/yookassa-webhook
Content-Type: application/json
```

## Интеграция на фронтенде

### Общая логика работы с платежами

#### Схема работы:

1. **Создание платежа** → получение `paymentUrl`
2. **Перенаправление пользователя** на страницу оплаты YooKassa
3. **Отслеживание статуса** через WebSocket или polling
4. **Обработка результата** (успех/ошибка)

#### Состояния платежа:

- `pending` - ожидает оплаты
- `paid`/`success` - успешно оплачен
- `failed` - ошибка оплаты

### React/React Native пример

#### 1. Создание платежа для заказа

```typescript
interface PaymentResponse {
  paymentUrl: string;
  paymentId: string;
  status: string;
}

// Создание платежа
const createOrderPayment = async (
  orderId: string,
  amount: number,
): Promise<PaymentResponse> => {
  const response = await fetch('/api/orders/payment/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({
      orderId,
      amount,
    }),
  });

  if (!response.ok) {
    throw new Error('Ошибка создания платежа');
  }

  return response.json();
};

// Использование
const handleOrderPayment = async () => {
  try {
    const payment = await createOrderPayment(orderId, 1500.0);

    // Перенаправляем пользователя на страницу оплаты YooKassa
    window.location.href = payment.paymentUrl;

    // Или для мобильного приложения
    // Linking.openURL(payment.paymentUrl);
  } catch (error) {
    console.error('Ошибка оплаты:', error);
  }
};
```

#### 2. Создание платежа для подписки

```typescript
const createSubscriptionPayment = async (
  subscriptionId: string,
  amount: number,
  subscriptionType: string,
  planId: string,
): Promise<PaymentResponse> => {
  const response = await fetch('/api/subscriptions/payment/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({
      subscriptionId,
      amount,
      subscriptionType,
      planId,
    }),
  });

  return response.json();
};
```

#### 3. Проверка статуса платежа

```typescript
const checkPaymentStatus = async (
  paymentId: string,
  type: 'order' | 'subscription',
) => {
  const endpoint =
    type === 'order'
      ? `/api/orders/payment/status/${paymentId}`
      : `/api/subscriptions/payment/status/${paymentId}`;

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${getAuthToken()}`,
    },
  });

  return response.json();
};

// Периодическая проверка статуса
const pollPaymentStatus = (
  paymentId: string,
  type: 'order' | 'subscription',
) => {
  const interval = setInterval(async () => {
    try {
      const status = await checkPaymentStatus(paymentId, type);

      if (status.status === 'paid' || status.status === 'success') {
        clearInterval(interval);
        // Платеж успешен
        onPaymentSuccess(status);
      } else if (status.status === 'failed') {
        clearInterval(interval);
        // Платеж неуспешен
        onPaymentError(status);
      }
    } catch (error) {
      console.error('Ошибка проверки статуса:', error);
    }
  }, 3000); // Проверяем каждые 3 секунды

  // Останавливаем проверку через 5 минут
  setTimeout(() => clearInterval(interval), 300000);
};
```

#### 4. WebSocket подключение для уведомлений

```typescript
import io from 'socket.io-client';

// Подключение к WebSocket для заказов
const orderSocket = io('/order-payment', {
  auth: {
    token: getAuthToken(),
  },
});

orderSocket.on('payment_success', (data) => {
  console.log('Платеж за заказ успешен:', data);
  // Обновить UI, показать успех
});

orderSocket.on('payment_error', (data) => {
  console.log('Ошибка платежа за заказ:', data);
  // Показать ошибку пользователю
});

// Подключение к WebSocket для подписок
const subscriptionSocket = io('/subscription-payment', {
  auth: {
    token: getAuthToken(),
  },
});

subscriptionSocket.on('payment_success', (data) => {
  console.log('Платеж за подписку успешен:', data);
  // Обновить статус подписки
});
```

#### 5. Полный пример компонента оплаты

```typescript
import React, { useState, useEffect } from "react";
import io from "socket.io-client";

interface PaymentComponentProps {
  orderId?: string;
  subscriptionId?: string;
  amount: number;
  type: "order" | "subscription";
  subscriptionType?: string;
  planId?: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

const PaymentComponent: React.FC<PaymentComponentProps> = ({
  orderId,
  subscriptionId,
  amount,
  type,
  subscriptionType,
  planId,
  onSuccess,
  onError,
}) => {
  const [paymentStatus, setPaymentStatus] = useState<
    "idle" | "loading" | "redirecting" | "waiting" | "success" | "error"
  >("idle");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // WebSocket подключение для отслеживания статуса
  useEffect(() => {
    if (paymentId && paymentStatus === "waiting") {
      const socket = io(`/${type}-payment`, {
        auth: { token: getAuthToken() },
      });

      // Присоединяемся к комнате для получения уведомлений
      socket.emit(`join_${type}_payment_room`, { paymentId });

      socket.on("payment_success", (data) => {
        if (data.paymentId === paymentId) {
          setPaymentStatus("success");
          onSuccess?.();
        }
      });

      socket.on("payment_error", (data) => {
        if (data.paymentId === paymentId) {
          setPaymentStatus("error");
          setError(data.message || "Ошибка оплаты");
          onError?.(data.message || "Ошибка оплаты");
        }
      });

      return () => {
        socket.emit(`leave_${type}_payment_room`, { paymentId });
        socket.disconnect();
      };
    }
  }, [paymentId, paymentStatus, type, onSuccess, onError]);

  // Polling как резервный способ отслеживания
  useEffect(() => {
    if (paymentId && paymentStatus === "waiting") {
      const interval = setInterval(async () => {
        try {
          const status = await checkPaymentStatus(paymentId, type);

          if (status.status === "paid" || status.status === "success") {
            setPaymentStatus("success");
            onSuccess?.();
            clearInterval(interval);
          } else if (status.status === "failed") {
            setPaymentStatus("error");
            setError("Платеж отклонен");
            onError?.("Платеж отклонен");
            clearInterval(interval);
          }
        } catch (error) {
          console.error("Ошибка проверки статуса:", error);
        }
      }, 3000);

      // Останавливаем через 10 минут
      const timeout = setTimeout(() => {
        clearInterval(interval);
        if (paymentStatus === "waiting") {
          setPaymentStatus("error");
          setError("Время ожидания истекло");
          onError?.("Время ожидания истекло");
        }
      }, 600000);

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, [paymentId, paymentStatus, type, onSuccess, onError]);

  const handlePayment = async () => {
    setPaymentStatus("loading");
    setError(null);

    try {
      let payment: PaymentResponse;

      if (type === "order" && orderId) {
        payment = await createOrderPayment(orderId, amount);
      } else if (
        type === "subscription" &&
        subscriptionId &&
        subscriptionType &&
        planId
      ) {
        payment = await createSubscriptionPayment(
          subscriptionId,
          amount,
          subscriptionType,
          planId
        );
      } else {
        throw new Error("Недостаточно данных для создания платежа");
      }

      setPaymentId(payment.paymentId);
      setPaymentStatus("redirecting");

      // Сохраняем ID платежа для возврата
      localStorage.setItem("currentPaymentId", payment.paymentId);
      localStorage.setItem("currentPaymentType", type);

      // Перенаправляем на страницу оплаты
      window.location.href = payment.paymentUrl;
    } catch (error) {
      console.error("Ошибка создания платежа:", error);
      setPaymentStatus("error");
      setError(error.message || "Ошибка создания платежа");
      onError?.(error.message || "Ошибка создания платежа");
    }
  };

  // Обработка возврата с страницы оплаты
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const returnedPaymentId = urlParams.get("paymentId");

    if (returnedPaymentId) {
      const savedPaymentId = localStorage.getItem("currentPaymentId");
      const savedPaymentType = localStorage.getItem("currentPaymentType");

      if (returnedPaymentId === savedPaymentId && savedPaymentType === type) {
        setPaymentId(returnedPaymentId);
        setPaymentStatus("waiting");

        // Очищаем localStorage
        localStorage.removeItem("currentPaymentId");
        localStorage.removeItem("currentPaymentType");
      }
    }
  }, [type]);

  const getStatusMessage = () => {
    switch (paymentStatus) {
      case "loading":
        return "Создание платежа...";
      case "redirecting":
        return "Перенаправление на страницу оплаты...";
      case "waiting":
        return "Ожидание подтверждения оплаты...";
      case "success":
        return "Платеж успешно завершен!";
      case "error":
        return error || "Ошибка при оплате";
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (paymentStatus) {
      case "success":
        return "green";
      case "error":
        return "red";
      case "loading":
      case "redirecting":
      case "waiting":
        return "orange";
      default:
        return "black";
    }
  };

  return (
    <div
      style={{ padding: "20px", border: "1px solid #ddd", borderRadius: "8px" }}
    >
      <h3>Оплата {type === "order" ? "заказа" : "подписки"}</h3>
      <p>
        <strong>Сумма: {amount} ₽</strong>
      </p>

      {paymentStatus === "idle" && (
        <button
          onClick={handlePayment}
          style={{
            padding: "12px 24px",
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "16px",
          }}
        >
          Оплатить
        </button>
      )}

      {paymentStatus !== "idle" && (
        <div>
          <p style={{ color: getStatusColor(), fontWeight: "bold" }}>
            {getStatusMessage()}
          </p>

          {(paymentStatus === "loading" || paymentStatus === "waiting") && (
            <div
              style={{
                width: "20px",
                height: "20px",
                border: "2px solid #f3f3f3",
                borderTop: "2px solid #3498db",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                margin: "10px auto",
              }}
            />
          )}

          {paymentStatus === "error" && (
            <button
              onClick={() => setPaymentStatus("idle")}
              style={{
                padding: "8px 16px",
                backgroundColor: "#dc3545",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                marginTop: "10px",
              }}
            >
              Попробовать снова
            </button>
          )}
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
};

export default PaymentComponent;
```

#### 6. Хук для управления платежами

```typescript
import { useState, useCallback } from 'react';

interface UsePaymentOptions {
  onSuccess?: (paymentId: string) => void;
  onError?: (error: string) => void;
}

export const usePayment = (options: UsePaymentOptions = {}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createOrderPayment = useCallback(
    async (orderId: string, amount: number) => {
      setIsLoading(true);
      setError(null);

      try {
        const payment = await createOrderPayment(orderId, amount);
        return payment;
      } catch (err) {
        const errorMessage = err.message || 'Ошибка создания платежа';
        setError(errorMessage);
        options.onError?.(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [options],
  );

  const createSubscriptionPayment = useCallback(
    async (
      subscriptionId: string,
      amount: number,
      subscriptionType: string,
      planId: string,
    ) => {
      setIsLoading(true);
      setError(null);

      try {
        const payment = await createSubscriptionPayment(
          subscriptionId,
          amount,
          subscriptionType,
          planId,
        );
        return payment;
      } catch (err) {
        const errorMessage = err.message || 'Ошибка создания платежа';
        setError(errorMessage);
        options.onError?.(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [options],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    createOrderPayment,
    createSubscriptionPayment,
    isLoading,
    error,
    clearError,
  };
};
```

#### 7. Обработка возврата с страницы оплаты

```typescript
// Компонент для обработки возврата с YooKassa
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

const PaymentReturnPage: React.FC = () => {
  const { paymentId } = useParams<{ paymentId: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "success" | "error">(
    "checking"
  );

  useEffect(() => {
    if (paymentId) {
      checkPaymentResult(paymentId);
    }
  }, [paymentId]);

  const checkPaymentResult = async (paymentId: string) => {
    try {
      // Определяем тип платежа из localStorage или URL
      const paymentType = localStorage.getItem("currentPaymentType") || "order";

      const payment = await checkPaymentStatus(
        paymentId,
        paymentType as "order" | "subscription"
      );

      if (payment.status === "paid" || payment.status === "success") {
        setStatus("success");

        // Перенаправляем на страницу успеха через 3 секунды
        setTimeout(() => {
          if (paymentType === "order") {
            navigate("/orders/success");
          } else {
            navigate("/subscriptions/success");
          }
        }, 3000);
      } else if (payment.status === "failed") {
        setStatus("error");
      } else {
        // Если статус еще pending, ждем
        setTimeout(() => checkPaymentResult(paymentId), 2000);
      }
    } catch (error) {
      console.error("Ошибка проверки платежа:", error);
      setStatus("error");
    }
  };

  return (
    <div style={{ textAlign: "center", padding: "50px" }}>
      {status === "checking" && (
        <div>
          <h2>Проверяем статус платежа...</h2>
          <div className="spinner" />
        </div>
      )}

      {status === "success" && (
        <div>
          <h2 style={{ color: "green" }}>✅ Платеж успешно завершен!</h2>
          <p>Вы будете перенаправлены автоматически...</p>
        </div>
      )}

      {status === "error" && (
        <div>
          <h2 style={{ color: "red" }}>❌ Ошибка оплаты</h2>
          <p>Платеж не был завершен. Попробуйте еще раз.</p>
          <button onClick={() => navigate(-1)}>Вернуться назад</button>
        </div>
      )}
    </div>
  );
};

export default PaymentReturnPage;
```

### React Native пример

```typescript
import { Linking } from 'react-native';

const handlePayment = async () => {
  try {
    const payment = await createOrderPayment(orderId, amount);

    // Открываем браузер для оплаты
    const supported = await Linking.canOpenURL(payment.paymentUrl);

    if (supported) {
      await Linking.openURL(payment.paymentUrl);
    } else {
      console.error('Не удается открыть ссылку для оплаты');
    }
  } catch (error) {
    console.error('Ошибка оплаты:', error);
  }
};
```

## Тестирование

### Симуляция платежей (для разработки)

```http
POST /orders/payment/simulate/{paymentId}
POST /subscriptions/payment/simulate/{paymentId}
```

Эти endpoints позволяют симулировать успешную оплату без реального перехода в YooKassa.

### Webhook тестирование

Для тестирования webhook'ов можно использовать ngrok:

```bash
# Установка ngrok
npm install -g ngrok

# Запуск туннеля
ngrok http 3000

# Используйте полученный URL для настройки webhook'ов в YooKassa
# Например: https://abc123.ngrok.io/orders/payment/yookassa-webhook
```

## Лучшие практики для фронтенда

### 1. Управление состоянием платежа

```typescript
// Используйте enum для состояний
enum PaymentStatus {
  IDLE = 'idle',
  LOADING = 'loading',
  REDIRECTING = 'redirecting',
  WAITING = 'waiting',
  SUCCESS = 'success',
  ERROR = 'error',
}

// Централизованное управление через Context
const PaymentContext = createContext<{
  currentPayment: PaymentState | null;
  createPayment: (data: PaymentData) => Promise<void>;
  clearPayment: () => void;
}>({});
```

### 2. Обработка ошибок

```typescript
const handlePaymentError = (error: any) => {
  // Логирование ошибок
  console.error('Payment error:', error);

  // Показ пользователю понятного сообщения
  const userMessage =
    error.response?.data?.message || 'Произошла ошибка при оплате';

  // Отправка в систему аналитики
  analytics.track('payment_error', {
    error: error.message,
    paymentId: currentPaymentId,
    timestamp: new Date().toISOString(),
  });

  setError(userMessage);
};
```

### 3. Кэширование и оптимизация

```typescript
// Кэширование статуса платежей
const paymentCache = new Map<string, PaymentStatus>();

const getCachedPaymentStatus = (paymentId: string) => {
  return paymentCache.get(paymentId);
};

// Дебаунс для проверки статуса
const debouncedStatusCheck = debounce(checkPaymentStatus, 1000);
```

### 4. Уведомления пользователя

```typescript
// Показ уведомлений о статусе
const showPaymentNotification = (status: PaymentStatus, message: string) => {
  switch (status) {
    case PaymentStatus.SUCCESS:
      toast.success(message, { duration: 5000 });
      break;
    case PaymentStatus.ERROR:
      toast.error(message, { duration: 8000 });
      break;
    case PaymentStatus.WAITING:
      toast.info(message, { duration: 3000 });
      break;
  }
};
```

### 5. Аналитика и метрики

```typescript
// Отслеживание событий платежей
const trackPaymentEvent = (event: string, data: any) => {
  analytics.track(event, {
    ...data,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: window.location.href,
  });
};

// Примеры событий
trackPaymentEvent('payment_initiated', { paymentId, amount, type });
trackPaymentEvent('payment_redirected', { paymentId, paymentUrl });
trackPaymentEvent('payment_completed', { paymentId, status });
```

## Безопасность

1. **Валидация webhook'ов**: Рекомендуется добавить проверку подписи от YooKassa
2. **HTTPS**: В продакшене обязательно используйте HTTPS для webhook'ов
3. **Авторизация**: Все endpoints кроме webhook'ов требуют JWT токен
4. **Валидация сумм**: Суммы валидируются на бэкенде перед созданием платежа
5. **Защита от CSRF**: Используйте CSRF токены для критичных операций
6. **Логирование**: Логируйте все платежные операции для аудита

## Мониторинг

Все платежи логируются в базу данных с аудитом действий. Для мониторинга используйте:

- Логи создания платежей
- Логи изменения статусов
- WebSocket уведомления
- Проверка статусов через API

## Примеры использования

### 1. Оплата заказа в корзине

```typescript
const CheckoutPage: React.FC = () => {
  const { orderId, totalAmount } = useCart();
  const [isPaymentVisible, setIsPaymentVisible] = useState(false);

  const handleCheckout = () => {
    setIsPaymentVisible(true);
  };

  const handlePaymentSuccess = () => {
    // Очищаем корзину
    clearCart();
    // Перенаправляем на страницу успеха
    navigate("/order-success");
  };

  return (
    <div>
      <h2>Оформление заказа</h2>
      <p>Сумма: {totalAmount} ₽</p>

      {!isPaymentVisible ? (
        <button onClick={handleCheckout}>Перейти к оплате</button>
      ) : (
        <PaymentComponent
          type="order"
          orderId={orderId}
          amount={totalAmount}
          onSuccess={handlePaymentSuccess}
          onError={(error) => console.error("Payment failed:", error)}
        />
      )}
    </div>
  );
};
```

### 2. Покупка подписки

```typescript
const SubscriptionPlans: React.FC = () => {
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(
    null
  );
  const { user } = useAuth();

  const handleSelectPlan = async (plan: SubscriptionPlan) => {
    try {
      // Создаем подписку
      const subscription = await createSubscription({
        userId: user.id,
        planId: plan.id,
        type: plan.type,
      });

      setSelectedPlan({ ...plan, subscriptionId: subscription.id });
    } catch (error) {
      console.error("Error creating subscription:", error);
    }
  };

  const handleSubscriptionSuccess = () => {
    // Обновляем статус пользователя
    refreshUserData();
    // Показываем успешное сообщение
    toast.success("Подписка успешно активирована!");
    navigate("/dashboard");
  };

  return (
    <div>
      <h2>Выберите план подписки</h2>

      {plans.map((plan) => (
        <div key={plan.id} className="plan-card">
          <h3>{plan.name}</h3>
          <p>{plan.price} ₽/месяц</p>
          <button onClick={() => handleSelectPlan(plan)}>Выбрать план</button>
        </div>
      ))}

      {selectedPlan && (
        <PaymentComponent
          type="subscription"
          subscriptionId={selectedPlan.subscriptionId}
          amount={selectedPlan.price}
          subscriptionType={selectedPlan.type}
          planId={selectedPlan.id}
          onSuccess={handleSubscriptionSuccess}
        />
      )}
    </div>
  );
};
```

### 3. Мобильное приложение (React Native)

```typescript
import { Linking, Alert } from "react-native";

const PaymentScreen: React.FC = ({ route }) => {
  const { orderId, amount } = route.params;
  const [paymentStatus, setPaymentStatus] = useState("idle");

  const handlePayment = async () => {
    try {
      setPaymentStatus("loading");

      const payment = await createOrderPayment(orderId, amount);

      // Проверяем, можем ли открыть ссылку
      const supported = await Linking.canOpenURL(payment.paymentUrl);

      if (supported) {
        setPaymentStatus("redirecting");
        await Linking.openURL(payment.paymentUrl);

        // Начинаем отслеживать статус
        setPaymentStatus("waiting");
        startPaymentTracking(payment.paymentId);
      } else {
        Alert.alert("Ошибка", "Не удается открыть страницу оплаты");
        setPaymentStatus("error");
      }
    } catch (error) {
      Alert.alert("Ошибка", error.message);
      setPaymentStatus("error");
    }
  };

  const startPaymentTracking = (paymentId: string) => {
    const interval = setInterval(async () => {
      try {
        const status = await checkPaymentStatus(paymentId, "order");

        if (status.status === "paid") {
          clearInterval(interval);
          setPaymentStatus("success");
          Alert.alert("Успех", "Платеж завершен успешно!");
        } else if (status.status === "failed") {
          clearInterval(interval);
          setPaymentStatus("error");
          Alert.alert("Ошибка", "Платеж не прошел");
        }
      } catch (error) {
        console.error("Status check error:", error);
      }
    }, 3000);

    // Останавливаем через 5 минут
    setTimeout(() => clearInterval(interval), 300000);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Оплата заказа</Text>
      <Text style={styles.amount}>Сумма: {amount} ₽</Text>

      {paymentStatus === "idle" && (
        <TouchableOpacity style={styles.payButton} onPress={handlePayment}>
          <Text style={styles.payButtonText}>Оплатить</Text>
        </TouchableOpacity>
      )}

      {paymentStatus === "loading" && (
        <ActivityIndicator size="large" color="#007bff" />
      )}

      {paymentStatus === "waiting" && (
        <View>
          <ActivityIndicator size="large" color="#007bff" />
          <Text>Ожидание подтверждения оплаты...</Text>
        </View>
      )}

      {paymentStatus === "success" && (
        <Text style={styles.successText}>✅ Платеж успешно завершен!</Text>
      )}

      {paymentStatus === "error" && (
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => setPaymentStatus("idle")}
        >
          <Text>Попробовать снова</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};
```

### 4. Интеграция с состоянием приложения (Redux)

```typescript
// actions/payment.ts
export const createPaymentAction =
  (paymentData: PaymentData) => async (dispatch: Dispatch) => {
    dispatch({ type: 'PAYMENT_LOADING' });

    try {
      const payment = await createOrderPayment(
        paymentData.orderId,
        paymentData.amount,
      );

      dispatch({
        type: 'PAYMENT_CREATED',
        payload: payment,
      });

      // Сохраняем в localStorage для восстановления после редиректа
      localStorage.setItem('currentPayment', JSON.stringify(payment));

      return payment;
    } catch (error) {
      dispatch({
        type: 'PAYMENT_ERROR',
        payload: error.message,
      });
      throw error;
    }
  };

// reducer/payment.ts
const paymentReducer = (state = initialState, action: any) => {
  switch (action.type) {
    case 'PAYMENT_LOADING':
      return { ...state, isLoading: true, error: null };

    case 'PAYMENT_CREATED':
      return {
        ...state,
        isLoading: false,
        currentPayment: action.payload,
      };

    case 'PAYMENT_SUCCESS':
      return {
        ...state,
        currentPayment: { ...state.currentPayment, status: 'success' },
      };

    case 'PAYMENT_ERROR':
      return {
        ...state,
        isLoading: false,
        error: action.payload,
      };

    default:
      return state;
  }
};
```

## Поддержка

При возникновении проблем проверьте:

1. Правильность настройки переменных окружения
2. Доступность webhook URL для YooKassa
3. Корректность JWT токенов
4. Логи приложения для детальной диагностики
5. Статус платежа в личном кабинете YooKassa
6. Корректность URL для возврата пользователя
