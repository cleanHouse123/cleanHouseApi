# WebSocket Setup для фронтенда

## URL для подключения

### Подписки

```
ws://cleanhouse123-cleanhouseapi-209c.twc1.net:3000/subscription-payment
```

### Заказы

```
ws://cleanhouse123-cleanhouseapi-209c.twc1.net:3000/order-payment
```

## Пример подключения на фронтенде

```javascript
import { io } from 'socket.io-client';

// Для подписок
const subscriptionSocket = io(
  'ws://cleanhouse123-cleanhouseapi-209c.twc1.net:3000/subscription-payment',
  {
    transports: ['websocket'],
    upgrade: false,
  },
);

// Для заказов
const orderSocket = io(
  'ws://cleanhouse123-cleanhouseapi-209c.twc1.net:3000/order-payment',
  {
    transports: ['websocket'],
    upgrade: false,
  },
);

// Подключение к комнате платежа подписки
subscriptionSocket.emit('join_payment_room', {
  userId: 'user_id',
  paymentId: 'payment_id',
});

// Подключение к комнате платежа заказа
orderSocket.emit('join_order_payment_room', {
  userId: 'user_id',
  paymentId: 'payment_id',
});

// Слушаем события успешной оплаты подписки
subscriptionSocket.on('payment_success', (data) => {
  console.log('Подписка оплачена:', data);
  // Закрыть модалку
});

// Слушаем события успешной оплаты заказа
orderSocket.on('order_payment_success', (data) => {
  console.log('Заказ оплачен:', data);
  // Закрыть модалку
});

// Слушаем ошибки оплаты
subscriptionSocket.on('payment_error', (data) => {
  console.log('Ошибка оплаты подписки:', data);
});

orderSocket.on('order_payment_error', (data) => {
  console.log('Ошибка оплаты заказа:', data);
});

// Слушаем обновления статуса
subscriptionSocket.on('payment_status_update', (data) => {
  console.log('Статус платежа подписки:', data);
});

orderSocket.on('order_payment_status_update', (data) => {
  console.log('Статус платежа заказа:', data);
});
```

## События

### Подписки (namespace: /subscription-payment)

- `join_payment_room` - подключение к комнате платежа
- `leave_payment_room` - отключение от комнаты платежа
- `payment_success` - успешная оплата
- `payment_error` - ошибка оплаты
- `payment_status_update` - обновление статуса платежа

### Заказы (namespace: /order-payment)

- `join_order_payment_room` - подключение к комнате платежа
- `leave_order_payment_room` - отключение от комнаты платежа
- `order_payment_success` - успешная оплата
- `order_payment_error` - ошибка оплаты
- `order_payment_status_update` - обновление статуса платежа

## Логика создания заказов

### С активной подпиской

Если у пользователя есть активная подписка:

- Поле `paymentMethod` в запросе создания заказа **необязательно**
- Заказ автоматически создается со статусом `PAID`
- Создается автоматический платеж с суммой 0 (бесплатно для подписчиков)

### Без активной подписки

Если у пользователя нет активной подписки:

- Поле `paymentMethod` в запросе создания заказа **обязательно**
- Заказ создается со статусом `NEW`
- Требуется создание ссылки на оплату для завершения заказа

### Пример запроса создания заказа

```javascript
// С активной подпиской (paymentMethod необязательно)
const orderWithSubscription = {
  customerId: 'user-uuid',
  address: 'ул. Пушкина, д. 10',
  description: 'Уборка квартиры',
  // paymentMethod не требуется - заказ автоматически оплачивается
};

// Без активной подписки (paymentMethod обязательно)
const orderWithoutSubscription = {
  customerId: 'user-uuid',
  address: 'ул. Пушкина, д. 10',
  description: 'Уборка квартиры',
  paymentMethod: 'card', // обязательно - один из: 'cash', 'card', 'online'
};

// С активной подпиской и явным указанием способа оплаты
const orderWithSubscriptionExplicit = {
  customerId: 'user-uuid',
  address: 'ул. Пушкина, д. 10',
  description: 'Уборка квартиры',
  paymentMethod: 'subscription', // требует активную подписку
};

// Также можно не передавать paymentMethod вообще (undefined)
const orderWithoutPaymentMethod = {
  customerId: 'user-uuid',
  address: 'ул. Пушкина, д. 10',
  description: 'Уборка квартиры',
  // paymentMethod: undefined - валидация пройдет, но в сервисе будет проверка подписки
};
```

### Валидация

- Поле `paymentMethod` теперь полностью опциональное
- Если передано значение, оно должно быть одним из: `'cash'`, `'card'`, `'online'`, `'subscription'`
- Если не передано (undefined/null), валидация проходит успешно
- В сервисе проверяется наличие активной подписки:
  - **Есть подписка**: заказ создается со статусом `PAID`
  - **Нет подписки**: требуется `paymentMethod`, иначе ошибка
  - **`paymentMethod: 'subscription'`**: требует активную подписку, иначе ошибка

### Способы оплаты

- `'cash'` - наличными
- `'card'` - картой
- `'online'` - онлайн платеж
- `'subscription'` - через подписку (требует активную подписку)
