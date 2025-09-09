# Настройка WebSocket на фронтенде для подписок и заказов

## Проблема с Workbox

Ошибки в консоли:

```
workbox Precaching did not find a match for /socket.io/?EIO=4&transport=polling&t=PajosAl
workbox No route found for: /socket.io/?EIO=4&transport=polling&t=PajosB0&sid=ROQceDhA7uAue7JLAAAA
```

**Решение:** WebSocket соединения не должны кэшироваться Service Worker. Нужно исключить их из кэширования.

## 1. Настройка Service Worker (Workbox)

### В файле `sw.js` или `workbox-config.js`:

```javascript
// Исключаем WebSocket соединения из кэширования
workbox.routing.registerRoute(
  ({ url }) => url.pathname.startsWith('/socket.io/'),
  new workbox.strategies.NetworkOnly(),
);

// Или в workbox-config.js
module.exports = {
  runtimeCaching: [
    {
      urlPattern: /^https?:\/\/.*\/socket\.io\//,
      handler: 'NetworkOnly',
    },
  ],
};
```

### В файле `vite.config.js` (если используете Vite):

```javascript
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/socket\.io\//,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
});
```

## 2. Настройка WebSocket соединений

### URL для подключения:

```javascript
// Для подписок
const SUBSCRIPTION_WS_URL =
  'ws://cleanhouse123-cleanhouseapi-209c.twc1.net:3000/subscription-payment';

// Для заказов
const ORDER_WS_URL =
  'ws://cleanhouse123-cleanhouseapi-209c.twc1.net:3000/order-payment';
```

### Создание WebSocket сервиса:

```javascript
// services/websocket.service.js
import { io } from 'socket.io-client';

class WebSocketService {
  constructor() {
    this.subscriptionSocket = null;
    this.orderSocket = null;
    this.isConnected = false;
  }

  // Подключение к WebSocket подписок
  connectSubscription() {
    if (this.subscriptionSocket?.connected) return;

    this.subscriptionSocket = io(SUBSCRIPTION_WS_URL, {
      transports: ['websocket'],
      upgrade: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.subscriptionSocket.on('connect', () => {
      console.log('Connected to subscription WebSocket');
      this.isConnected = true;
    });

    this.subscriptionSocket.on('disconnect', () => {
      console.log('Disconnected from subscription WebSocket');
      this.isConnected = false;
    });

    return this.subscriptionSocket;
  }

  // Подключение к WebSocket заказов
  connectOrder() {
    if (this.orderSocket?.connected) return;

    this.orderSocket = io(ORDER_WS_URL, {
      transports: ['websocket'],
      upgrade: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.orderSocket.on('connect', () => {
      console.log('Connected to order WebSocket');
      this.isConnected = true;
    });

    this.orderSocket.on('disconnect', () => {
      console.log('Disconnected from order WebSocket');
      this.isConnected = false;
    });

    return this.orderSocket;
  }

  // Отключение от WebSocket
  disconnect() {
    if (this.subscriptionSocket) {
      this.subscriptionSocket.disconnect();
      this.subscriptionSocket = null;
    }
    if (this.orderSocket) {
      this.orderSocket.disconnect();
      this.orderSocket = null;
    }
    this.isConnected = false;
  }
}

export default new WebSocketService();
```

## 3. Обработка платежей подписок

### В компоненте PaymentModal:

```javascript
// components/PaymentModal.tsx
import { useEffect, useState } from 'react';
import websocketService from '../services/websocket.service';

export default function PaymentModal({ paymentId, onSuccess, onError }) {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Подключаемся к WebSocket подписок
    const subscriptionSocket = websocketService.connectSubscription();
    setSocket(subscriptionSocket);

    // Присоединяемся к комнате платежа
    subscriptionSocket.emit('join_payment_room', {
      userId: 'current-user-id', // Замените на реальный ID пользователя
      paymentId: paymentId,
    });

    // Обработка успешной оплаты
    subscriptionSocket.on('payment_success', (data) => {
      console.log('Подписка оплачена:', data);
      onSuccess(data);
      // Закрыть модалку или перенаправить
    });

    // Обработка ошибки оплаты
    subscriptionSocket.on('payment_error', (data) => {
      console.log('Ошибка оплаты подписки:', data);
      onError(data.error);
    });

    // Обработка обновления статуса
    subscriptionSocket.on('payment_status_update', (data) => {
      console.log('Статус платежа обновлен:', data);
      // Обновить UI статуса
    });

    // Обработка подключения
    subscriptionSocket.on('connect', () => {
      setIsConnected(true);
    });

    // Обработка отключения
    subscriptionSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    // Очистка при размонтировании
    return () => {
      subscriptionSocket.emit('leave_payment_room', {
        userId: 'current-user-id',
        paymentId: paymentId,
      });
    };
  }, [paymentId]);

  return (
    <div>
      {isConnected ? (
        <div>Ожидание оплаты...</div>
      ) : (
        <div>Подключение к серверу...</div>
      )}
    </div>
  );
}
```

## 4. Обработка платежей заказов

### В компоненте OrderPaymentModal:

```javascript
// components/OrderPaymentModal.tsx
import { useEffect, useState } from 'react';
import websocketService from '../services/websocket.service';

export default function OrderPaymentModal({ paymentId, onSuccess, onError }) {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Подключаемся к WebSocket заказов
    const orderSocket = websocketService.connectOrder();
    setSocket(orderSocket);

    // Присоединяемся к комнате платежа заказа
    orderSocket.emit('join_order_payment_room', {
      userId: 'current-user-id', // Замените на реальный ID пользователя
      paymentId: paymentId,
    });

    // Обработка успешной оплаты заказа
    orderSocket.on('order_payment_success', (data) => {
      console.log('Заказ оплачен:', data);
      onSuccess(data);
      // Закрыть модалку или перенаправить
    });

    // Обработка ошибки оплаты заказа
    orderSocket.on('order_payment_error', (data) => {
      console.log('Ошибка оплаты заказа:', data);
      onError(data.error);
    });

    // Обработка обновления статуса
    orderSocket.on('order_payment_status_update', (data) => {
      console.log('Статус платежа заказа обновлен:', data);
      // Обновить UI статуса
    });

    // Обработка подключения
    orderSocket.on('connect', () => {
      setIsConnected(true);
    });

    // Обработка отключения
    orderSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    // Очистка при размонтировании
    return () => {
      orderSocket.emit('leave_order_payment_room', {
        userId: 'current-user-id',
        paymentId: paymentId,
      });
    };
  }, [paymentId]);

  return (
    <div>
      {isConnected ? (
        <div>Ожидание оплаты заказа...</div>
      ) : (
        <div>Подключение к серверу...</div>
      )}
    </div>
  );
}
```

## 5. Обработка ошибок и переподключения

### В WebSocket сервисе:

```javascript
// services/websocket.service.js
class WebSocketService {
  constructor() {
    this.subscriptionSocket = null;
    this.orderSocket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  connectSubscription() {
    if (this.subscriptionSocket?.connected) return;

    this.subscriptionSocket = io(SUBSCRIPTION_WS_URL, {
      transports: ['websocket'],
      upgrade: false,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.subscriptionSocket.on('connect', () => {
      console.log('Connected to subscription WebSocket');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    this.subscriptionSocket.on('disconnect', (reason) => {
      console.log('Disconnected from subscription WebSocket:', reason);
      this.isConnected = false;
    });

    this.subscriptionSocket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`Reconnection attempt ${attemptNumber}`);
      this.reconnectAttempts = attemptNumber;
    });

    this.subscriptionSocket.on('reconnect_failed', () => {
      console.error('Failed to reconnect to subscription WebSocket');
      this.isConnected = false;
    });

    return this.subscriptionSocket;
  }

  // Аналогично для connectOrder()
}
```

## 6. Проверка статуса платежа

### Периодическая проверка статуса:

```javascript
// hooks/usePaymentStatus.js
import { useEffect, useState } from 'react';
import { api } from '../services/api';

export function usePaymentStatus(paymentId, type = 'subscription') {
  const [status, setStatus] = useState('pending');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!paymentId) return;

    const checkStatus = async () => {
      setIsLoading(true);
      try {
        const endpoint =
          type === 'subscription'
            ? `/subscriptions/payment/${paymentId}`
            : `/orders/payment/${paymentId}`;

        const response = await api.get(endpoint);
        setStatus(response.data.status);
      } catch (error) {
        console.error('Error checking payment status:', error);
      } finally {
        setIsLoading(false);
      }
    };

    // Проверяем статус сразу
    checkStatus();

    // Проверяем статус каждые 5 секунд
    const interval = setInterval(checkStatus, 5000);

    return () => clearInterval(interval);
  }, [paymentId, type]);

  return { status, isLoading };
}
```

## 7. Настройка в App.js

### Инициализация WebSocket при запуске приложения:

```javascript
// App.js
import { useEffect } from 'react';
import websocketService from './services/websocket.service';

function App() {
  useEffect(() => {
    // Инициализируем WebSocket соединения
    websocketService.connectSubscription();
    websocketService.connectOrder();

    // Очистка при размонтировании
    return () => {
      websocketService.disconnect();
    };
  }, []);

  return <div className="App">{/* Ваш контент */}</div>;
}

export default App;
```

## 8. Отладка WebSocket

### Добавьте логирование для отладки:

```javascript
// В WebSocket сервисе
this.subscriptionSocket.on('connect', () => {
  console.log('✅ Connected to subscription WebSocket');
});

this.subscriptionSocket.on('disconnect', (reason) => {
  console.log('❌ Disconnected from subscription WebSocket:', reason);
});

this.subscriptionSocket.on('payment_success', (data) => {
  console.log('🎉 Payment success:', data);
});

this.subscriptionSocket.on('payment_error', (data) => {
  console.log('💥 Payment error:', data);
});
```

## 9. Проверка работы

### Тестовые эндпоинты для симуляции платежей:

```javascript
// Симуляция успешной оплаты подписки
const simulateSubscriptionPayment = async (paymentId) => {
  try {
    const response = await fetch(
      `/api/subscriptions/payment/simulate/${paymentId}`,
      {
        method: 'POST',
      },
    );
    const data = await response.json();
    console.log('Simulation result:', data);
  } catch (error) {
    console.error('Simulation error:', error);
  }
};

// Симуляция успешной оплаты заказа
const simulateOrderPayment = async (paymentId) => {
  try {
    const response = await fetch(`/api/orders/payment/simulate/${paymentId}`, {
      method: 'POST',
    });
    const data = await response.json();
    console.log('Simulation result:', data);
  } catch (error) {
    console.error('Simulation error:', error);
  }
};
```

## 10. Итоговая структура файлов

```
src/
├── services/
│   └── websocket.service.js
├── components/
│   ├── PaymentModal.tsx
│   └── OrderPaymentModal.tsx
├── hooks/
│   └── usePaymentStatus.js
├── App.js
└── sw.js (или workbox-config.js)
```

После внесения этих изменений WebSocket соединения должны работать корректно, а ошибки Workbox исчезнут.
