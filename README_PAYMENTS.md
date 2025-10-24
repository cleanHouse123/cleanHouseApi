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

## 🔄 Упрощенный Flow оплаты

### 1. Создание платежа для заказа

```javascript
const createOrderPayment = async (orderId, amount) => {
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
    console.error('Ошибка создания платежа заказа:', error);
  }
};

// Использование
const payment = await createOrderPayment(orderId, 1500);
if (payment?.paymentUrl) {
  // Прямое перенаправление на YooKassa
  window.location.href = payment.paymentUrl;
}
```

### 1.1. Создание платежа для подписки

```javascript
const createSubscriptionPayment = async (
  subscriptionId,
  subscriptionType,
  amount,
) => {
  try {
    const response = await fetch('/subscription/payment/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        subscriptionId,
        subscriptionType, // 'basic', 'premium', 'pro'
        amount,
      }),
    });

    const data = await response.json();
    return data; // { paymentUrl, paymentId, status }
  } catch (error) {
    console.error('Ошибка создания платежа подписки:', error);
  }
};

// Использование
const payment = await createSubscriptionPayment(
  subscriptionId,
  'premium',
  29900,
);
if (payment?.paymentUrl) {
  // Прямое перенаправление на YooKassa
  window.location.href = payment.paymentUrl;
}
```

### 2. Автоматическая обработка

- **YooKassa** → отправляет webhook на `https://your-domain.com/webhooks/yookassa`
- **Backend** → автоматически обновляет статус платежа и заказа
- **Пользователь** → видит страницу "Платеж обрабатывается" и автоматически перенаправляется в приложение через 3 секунды

### 3. Отслеживание статуса в реальном времени

```javascript
// WebSocket подключение для получения обновлений
import { io } from 'socket.io-client';

const socket = io('your-backend-url');

// Подписка на обновления платежа заказа
socket.on(`order_payment_${paymentId}`, (data) => {
  console.log('Обновление статуса платежа заказа:', data);

  if (data.status === 'success') {
    // Платеж заказа успешен
    showSuccessMessage('Заказ оплачен успешно!');
    updateOrderStatus(data.orderId, 'paid');
  } else if (data.status === 'error') {
    // Ошибка платежа заказа
    showErrorMessage(data.error || 'Ошибка при оплате заказа');
  }
});

// Подписка на обновления платежа подписки
socket.on(`subscription_payment_${paymentId}`, (data) => {
  console.log('Обновление статуса платежа подписки:', data);

  if (data.status === 'success') {
    // Платеж подписки успешен
    showSuccessMessage('Подписка активирована!');
    updateSubscriptionStatus(data.subscriptionId, 'active');
  } else if (data.status === 'error') {
    // Ошибка платежа подписки
    showErrorMessage(data.error || 'Ошибка при оплате подписки');
  }
});
```

## 📱 Примеры для React Web App

### React компонент для оплаты

```jsx
import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const PaymentComponent = ({
  orderId,
  subscriptionId,
  subscriptionType,
  amount,
  type = 'order', // 'order' или 'subscription'
  onSuccess,
  onError,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // Инициализация WebSocket
    const socketConnection = io(process.env.REACT_APP_BACKEND_URL);
    setSocket(socketConnection);

    return () => {
      socketConnection.disconnect();
    };
  }, []);

  const handlePayment = async () => {
    setIsProcessing(true);

    try {
      const endpoint =
        type === 'subscription'
          ? '/subscription/payment/create'
          : '/orders/payment/create';

      const body =
        type === 'subscription'
          ? { subscriptionId, subscriptionType, amount }
          : { orderId, amount };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(body),
      });

      const payment = await response.json();

      if (payment.paymentUrl) {
        // Подписываемся на обновления статуса
        const eventName =
          type === 'subscription'
            ? `subscription_payment_${payment.paymentId}`
            : `order_payment_${payment.paymentId}`;

        socket?.on(eventName, (data) => {
          if (data.status === 'success') {
            onSuccess?.(data);
          } else if (data.status === 'error') {
            onError?.(data.error);
          }
          setIsProcessing(false);
        });

        // Перенаправляем на оплату
        window.location.href = payment.paymentUrl;
      }
    } catch (error) {
      console.error(`Ошибка создания платежа ${type}:`, error);
      onError?.(error.message);
      setIsProcessing(false);
    }
  };

  return (
    <div>
      <button
        onClick={handlePayment}
        disabled={isProcessing}
        className="payment-button"
      >
        {isProcessing ? 'Обработка...' : `Оплатить ${amount / 100} ₽`}
      </button>
    </div>
  );
};

export default PaymentComponent;
```

### Хук для управления платежами

```jsx
import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';

const usePayment = () => {
  const [socket, setSocket] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const socketConnection = io(process.env.REACT_APP_BACKEND_URL, {
      auth: {
        token: localStorage.getItem('token'),
      },
    });
    setSocket(socketConnection);

    return () => {
      socketConnection.disconnect();
    };
  }, []);

  const createPayment = useCallback(
    async (orderId, amount, onSuccess, onError) => {
      setIsProcessing(true);

      try {
        const response = await fetch('/orders/payment/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify({ orderId, amount }),
        });

        const payment = await response.json();

        if (payment.paymentUrl) {
          // Подписываемся на обновления статуса
          socket?.on(`order_payment_${payment.paymentId}`, (data) => {
            if (data.status === 'success') {
              onSuccess?.(data);
            } else if (data.status === 'error') {
              onError?.(data.error);
            }
            setIsProcessing(false);
          });

          // Перенаправляем на оплату
          window.location.href = payment.paymentUrl;
        }
      } catch (error) {
        console.error('Ошибка создания платежа:', error);
        onError?.(error.message);
        setIsProcessing(false);
      }
    },
    [socket],
  );

  return {
    createPayment,
    isProcessing,
  };
};

// Использование хука в компоненте заказа
const OrderComponent = ({ orderId, amount }) => {
  const { createPayment, isProcessing } = usePayment();

  const handlePaymentSuccess = (data) => {
    console.log('Платеж заказа успешен:', data);
    // Обновляем UI, показываем успех
  };

  const handlePaymentError = (error) => {
    console.error('Ошибка платежа заказа:', error);
    // Показываем ошибку пользователю
  };

  const handlePayClick = () => {
    createPayment(orderId, amount, handlePaymentSuccess, handlePaymentError);
  };

  return (
    <button onClick={handlePayClick} disabled={isProcessing}>
      {isProcessing ? 'Обработка...' : `Оплатить заказ ${amount / 100} ₽`}
    </button>
  );
};

// Использование хука в компоненте подписки
const SubscriptionComponent = ({
  subscriptionId,
  subscriptionType,
  amount,
}) => {
  const { createPayment, isProcessing } = usePayment();

  const handlePaymentSuccess = (data) => {
    console.log('Платеж подписки успешен:', data);
    // Активируем подписку в UI
  };

  const handlePaymentError = (error) => {
    console.error('Ошибка платежа подписки:', error);
    // Показываем ошибку пользователю
  };

  const handleSubscribeClick = () => {
    createPayment(
      subscriptionId,
      amount,
      handlePaymentSuccess,
      handlePaymentError,
      'subscription',
      subscriptionType,
    );
  };

  return (
    <button onClick={handleSubscribeClick} disabled={isProcessing}>
      {isProcessing
        ? 'Обработка...'
        : `Подписаться ${subscriptionType} ${amount / 100} ₽`}
    </button>
  );
};

export default usePayment;
```

### Компонент страницы возврата после оплаты

```jsx
import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

const PaymentReturn = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('processing');

  useEffect(() => {
    const paymentId = searchParams.get('paymentId');
    const paymentStatus = searchParams.get('status');
    const paymentType = searchParams.get('type'); // 'order' или 'subscription'
    const error = searchParams.get('error');

    if (error) {
      setStatus('error');
      return;
    }

    if (paymentId && paymentStatus === 'success') {
      setStatus('success');

      // Делаем контрольный запрос для проверки статуса
      verifyPaymentStatus(paymentId, paymentType);

      // Перенаправляем на соответствующую страницу через 3 секунды
      setTimeout(() => {
        const redirectPath =
          paymentType === 'subscription' ? '/subscriptions' : '/orders';
        navigate(redirectPath);
      }, 3000);
    } else {
      setStatus('error');
    }
  }, [searchParams, navigate]);

  const verifyPaymentStatus = async (paymentId, type) => {
    try {
      const endpoint =
        type === 'subscription'
          ? `/subscription/payment/status/${paymentId}`
          : `/orders/payment/status/${paymentId}`;

      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      const paymentData = await response.json();
      console.log('Подтверждение статуса платежа:', paymentData);

      if (paymentData.status !== 'success' && paymentData.status !== 'paid') {
        console.warn('Платеж не подтвержден:', paymentData);
        setStatus('error');
      }
    } catch (error) {
      console.error('Ошибка проверки статуса платежа:', error);
    }
  };

  const renderContent = () => {
    switch (status) {
      case 'success':
        const paymentType = searchParams.get('type');
        const isSubscription = paymentType === 'subscription';

        return (
          <div className="payment-success">
            <div className="success-icon">✅</div>
            <h1>Платеж успешно завершен!</h1>
            <p>
              {isSubscription
                ? 'Спасибо за оплату! Ваша подписка активирована.'
                : 'Спасибо за оплату. Ваш заказ принят в обработку.'}
            </p>
            <p>
              Вы будете перенаправлены на страницу{' '}
              {isSubscription ? 'подписок' : 'заказов'} через несколько
              секунд...
            </p>
            <button
              onClick={() =>
                navigate(isSubscription ? '/subscriptions' : '/orders')
              }
            >
              {isSubscription ? 'Перейти к подпискам' : 'Перейти к заказам'}{' '}
              сейчас
            </button>
          </div>
        );

      case 'error':
        return (
          <div className="payment-error">
            <div className="error-icon">❌</div>
            <h1>Ошибка при оплате</h1>
            <p>К сожалению, произошла ошибка при обработке платежа.</p>
            <button onClick={() => navigate('/orders')}>
              Вернуться к заказам
            </button>
          </div>
        );

      default:
        return (
          <div className="payment-processing">
            <div className="spinner"></div>
            <h1>Обработка платежа...</h1>
            <p>Пожалуйста, подождите</p>
          </div>
        );
    }
  };

  return <div className="payment-return-page">{renderContent()}</div>;
};

export default PaymentReturn;
```

### CSS стили для компонентов

```css
.payment-return-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: #f5f5f5;
  padding: 20px;
}

.payment-success,
.payment-error,
.payment-processing {
  background: white;
  padding: 40px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  text-align: center;
  max-width: 500px;
  width: 100%;
}

.success-icon,
.error-icon {
  font-size: 64px;
  margin-bottom: 20px;
}

.spinner {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #007aff;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.payment-button {
  background: #007aff;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.payment-button:hover {
  background: #0056cc;
}

.payment-button:disabled {
  background: #ccc;
  cursor: not-allowed;
}
```

## 🔗 API Endpoints

### Создание платежа для заказа

```
POST /orders/payment/create
Content-Type: application/json
Authorization: Bearer <token>

{
  "orderId": "uuid-заказа",
  "amount": 1500
}

Response:
{
  "paymentId": "uuid-платежа",
  "paymentUrl": "https://yoomoney.ru/checkout/payments/v2/contract?orderId=...",
  "status": "pending"
}
```

### Создание платежа для подписки

```
POST /subscription/payment/create
Content-Type: application/json
Authorization: Bearer <token>

{
  "subscriptionId": "uuid-подписки",
  "subscriptionType": "premium",
  "amount": 29900
}

Response:
{
  "paymentId": "uuid-платежа",
  "paymentUrl": "https://yoomoney.ru/checkout/payments/v2/contract?orderId=...",
  "status": "pending"
}
```

### Проверка статуса платежа

```
GET /orders/payment/status/:paymentId
Authorization: Bearer <token>

Response:
{
  "id": "uuid-платежа",
  "orderId": "uuid-заказа",
  "amount": 1500,
  "status": "paid", // pending, paid, failed, canceled
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

## 🔔 WebSocket Events

### Подключение

```javascript
const socket = io('your-backend-url', {
  auth: {
    token: 'your-jwt-token',
  },
});
```

### События платежей заказов

```javascript
// Успешный платеж
socket.on(`order_payment_${paymentId}`, (data) => {
  // data: { status: 'success', paymentId, orderId }
});

// Ошибка платежа
socket.on(`order_payment_error_${paymentId}`, (data) => {
  // data: { status: 'error', paymentId, orderId, error }
});
```

### События платежей подписок

```javascript
// Успешный платеж подписки
socket.on(`subscription_payment_${paymentId}`, (data) => {
  // data: { status: 'success', paymentId, subscriptionId, subscriptionType }
});

// Ошибка платежа подписки
socket.on(`subscription_payment_error_${paymentId}`, (data) => {
  // data: { status: 'error', paymentId, subscriptionId, error }
});
```

## 🔗 Настройка webhook'ов в YooKassa

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

## ⚠️ Особенности тестового режима

В тестовом режиме YooKassa может не передавать параметры в `return_url`. Это нормально - статус платежа обновляется через webhook'и автоматически.

**Что происходит:**

1. Пользователь оплачивает на YooKassa
2. YooKassa отправляет webhook на backend
3. Backend обновляет статус платежа
4. WebSocket уведомляет фронтенд о статусе
5. Пользователь видит результат в реальном времени

## 🎯 Лучшие практики

### 1. Обработка ошибок

```javascript
const handlePaymentError = (error) => {
  console.error('Ошибка платежа:', error);

  // Показать пользователю понятное сообщение
  switch (error) {
    case 'payment_not_found':
      showError('Платеж не найден');
      break;
    case 'processing_error':
      showError('Ошибка обработки платежа');
      break;
    default:
      showError('Произошла ошибка при оплате');
  }
};
```

### 2. Индикация загрузки

```javascript
const [paymentStatus, setPaymentStatus] = useState('idle'); // idle, processing, success, error

// Показывать спиннер во время обработки
if (paymentStatus === 'processing') {
  return <LoadingSpinner message="Обработка платежа..." />;
}
```

### 3. Таймауты

```javascript
// Устанавливаем таймаут для WebSocket событий
const paymentTimeout = setTimeout(() => {
  showError('Превышено время ожидания платежа');
  setPaymentStatus('error');
}, 300000); // 5 минут

socket.on(`order_payment_${paymentId}`, (data) => {
  clearTimeout(paymentTimeout);
  // Обработка события
});
```

## 🔧 Отладка

### Логи на backend

```bash
# Просмотр логов webhook'ов
docker logs -f your-container-name | grep "webhook"

# Просмотр логов YooKassa
docker logs -f your-container-name | grep "YooKassa"
```

### Проверка статуса платежа

```javascript
// Ручная проверка статуса
const checkPaymentStatus = async (paymentId) => {
  const response = await fetch(`/orders/payment/status/${paymentId}`);
  const status = await response.json();
  console.log('Статус платежа:', status);
};
```

## 📞 Поддержка

При возникновении проблем:

1. Проверьте логи backend'а
2. Убедитесь, что webhook'и настроены правильно
3. Проверьте WebSocket подключение
4. Обратитесь к разработчикам backend'а

---

**Важно:** Всегда тестируйте платежи в тестовом режиме перед переходом на продакшн!
