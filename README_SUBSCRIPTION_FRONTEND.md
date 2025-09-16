# 🚀 Полный флоу для фронтенда - Система подписок

## 📋 Обзор системы

Система подписок включает:

- ✅ Создание и управление подписками
- ✅ Безопасная система оплаты
- ✅ WebSocket уведомления в реальном времени
- ✅ Проверка статуса подписки
- ✅ Автоматическое продление

---

## 🛠 Настройка клиента

### 1. Базовая конфигурация API

```typescript
import axios from 'axios';
import io from 'socket.io-client';

const API_BASE_URL = 'https://cleanhouse123-cleanhouseapi-209c.twc1.net';
const WEBSOCKET_URL =
  'https://cleanhouse123-cleanhouseapi-209c.twc1.net/subscription-payment';

// Настройка axios
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});
```

### 2. Типы данных

```typescript
interface User {
  id: string;
  name: string;
  phone: string;
  email: string;
}

interface Subscription {
  id: string;
  user: User;
  type: 'monthly' | 'yearly' | 'one_time';
  status: 'pending' | 'active' | 'expired' | 'canceled';
  price: number;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
}

interface PaymentResponse {
  paymentUrl: string;
  paymentId: string;
  status: 'pending';
}

interface SubscriptionPlan {
  type: 'monthly' | 'yearly';
  price: number;
  duration: number;
  name: string;
  description: string;
}
```

---

## 🔄 Полный флоу подписки

### Шаг 1: Авторизация пользователя

```typescript
async function authenticateUser(phone: string, password: string) {
  try {
    const response = await api.post('/auth/login', {
      phone,
      password,
    });

    const authToken = response.data.access_token;
    const user = response.data.user;

    // Сохраняем токен для всех запросов
    api.defaults.headers.Authorization = `Bearer ${authToken}`;

    // Сохраняем в localStorage
    localStorage.setItem('authToken', authToken);
    localStorage.setItem('user', JSON.stringify(user));

    return { user, authToken };
  } catch (error) {
    console.error('Ошибка авторизации:', error);
    throw error;
  }
}
```

### Шаг 2: Проверка существующих подписок

```typescript
async function checkActiveSubscription(
  userId: string,
): Promise<Subscription | null> {
  try {
    const response = await api.get(`/subscriptions/user/${userId}`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      // Нет активной подписки
      return null;
    }
    throw error;
  }
}
```

### Шаг 3: Отображение тарифных планов

```typescript
const subscriptionPlans: SubscriptionPlan[] = [
  {
    type: 'monthly',
    price: 1000, // в копейках (10 рублей)
    duration: 30,
    name: 'Месячная подписка',
    description: 'Доступ ко всем функциям на 1 месяц'
  },
  {
    type: 'yearly',
    price: 10000, // в копейках (100 рублей)
    duration: 365,
    name: 'Годовая подписка',
    description: 'Доступ ко всем функциям на 1 год (экономия 20%)'
  }
];

function renderSubscriptionPlans() {
  return (
    <div className="subscription-plans">
      {subscriptionPlans.map(plan => (
        <div key={plan.type} className="plan-card">
          <h3>{plan.name}</h3>
          <p>{plan.description}</p>
          <div className="price">{plan.price / 100} ₽</div>
          <button onClick={() => selectPlan(plan)}>
            Выбрать план
          </button>
        </div>
      ))}
    </div>
  );
}
```

### Шаг 4: Создание подписки

```typescript
async function createSubscription(
  userId: string,
  plan: SubscriptionPlan,
): Promise<Subscription> {
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(startDate.getDate() + plan.duration);

  try {
    const response = await api.post('/subscriptions', {
      userId,
      type: plan.type,
      price: plan.price / 100, // конвертируем в рубли
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });

    return response.data;
  } catch (error) {
    console.error('Ошибка создания подписки:', error);
    throw error;
  }
}
```

### Шаг 5: Создание платежа

```typescript
async function createPayment(
  subscription: Subscription,
  plan: SubscriptionPlan,
): Promise<PaymentResponse> {
  try {
    const response = await api.post('/subscriptions/payment/create', {
      subscriptionId: subscription.id,
      subscriptionType: plan.type,
      amount: plan.price, // в копейках
    });

    return response.data;
  } catch (error) {
    console.error('Ошибка создания платежа:', error);
    throw error;
  }
}
```

### Шаг 6: WebSocket для отслеживания платежа

```typescript
class PaymentTracker {
  private socket: any;
  private paymentId: string;
  private userId: string;

  constructor(paymentId: string, userId: string) {
    this.paymentId = paymentId;
    this.userId = userId;
    this.initializeSocket();
  }

  private initializeSocket() {
    this.socket = io(WEBSOCKET_URL, {
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      console.log('WebSocket подключен');

      // Подключаемся к комнате платежа
      this.socket.emit('join_payment_room', {
        userId: this.userId,
        paymentId: this.paymentId,
      });
    });

    this.socket.on('payment_status_update', (data) => {
      console.log('Обновление статуса платежа:', data);
      this.onStatusUpdate(data);
    });

    this.socket.on('payment_success', (data) => {
      console.log('Платеж успешен:', data);
      this.onPaymentSuccess(data);
    });

    this.socket.on('payment_error', (data) => {
      console.log('Ошибка платежа:', data);
      this.onPaymentError(data);
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket отключен');
    });
  }

  private onStatusUpdate(data: any) {
    // Обновляем UI с новым статусом
    updatePaymentStatus(data.status);
  }

  private onPaymentSuccess(data: any) {
    // Показываем успешное завершение
    showSuccessMessage('Подписка успешно оформлена!');

    // Переходим к активной подписке
    redirectToSubscriptionDashboard();

    this.disconnect();
  }

  private onPaymentError(data: any) {
    // Показываем ошибку
    showErrorMessage(data.error || 'Ошибка при оплате');

    this.disconnect();
  }

  public disconnect() {
    if (this.socket) {
      this.socket.emit('leave_payment_room', {
        userId: this.userId,
        paymentId: this.paymentId,
      });
      this.socket.disconnect();
    }
  }
}
```

### Шаг 7: Полный флоу обработки

```typescript
async function handleSubscriptionFlow(
  userId: string,
  selectedPlan: SubscriptionPlan,
) {
  try {
    // 1. Показываем лоадер
    showLoader('Создание подписки...');

    // 2. Создаем подписку
    const subscription = await createSubscription(userId, selectedPlan);

    // 3. Создаем платеж
    const payment = await createPayment(subscription, selectedPlan);

    // 4. Запускаем WebSocket трекер
    const paymentTracker = new PaymentTracker(payment.paymentId, userId);

    // 5. Показываем страницу оплаты
    showPaymentPage(payment.paymentUrl, payment.paymentId);

    // 6. Открываем ссылку оплаты в новом окне
    const paymentWindow = window.open(payment.paymentUrl, '_blank');

    // 7. Показываем статус ожидания
    showPaymentWaiting(payment.paymentId);

    hideLoader();
  } catch (error) {
    hideLoader();
    showErrorMessage('Ошибка при создании подписки: ' + error.message);
  }
}
```

---

## 🎨 UI компоненты

### Компонент выбора плана

```typescript
function SubscriptionSelector({ onPlanSelect, currentSubscription }) {
  const [selectedPlan, setSelectedPlan] = useState(null);

  return (
    <div className="subscription-selector">
      <h2>Выберите план подписки</h2>

      {currentSubscription && (
        <div className="current-subscription">
          <h3>Текущая подписка</h3>
          <p>Тип: {currentSubscription.type}</p>
          <p>Статус: {currentSubscription.status}</p>
          <p>Действует до: {new Date(currentSubscription.endDate).toLocaleDateString()}</p>
        </div>
      )}

      <div className="plans-grid">
        {subscriptionPlans.map(plan => (
          <div
            key={plan.type}
            className={`plan-card ${selectedPlan?.type === plan.type ? 'selected' : ''}`}
            onClick={() => setSelectedPlan(plan)}
          >
            <h3>{plan.name}</h3>
            <div className="price">{plan.price / 100} ₽</div>
            <p>{plan.description}</p>
            <ul>
              <li>✅ Полный доступ к функциям</li>
              <li>✅ Техническая поддержка</li>
              <li>✅ Без рекламы</li>
            </ul>
          </div>
        ))}
      </div>

      {selectedPlan && (
        <button
          className="subscribe-button"
          onClick={() => onPlanSelect(selectedPlan)}
        >
          Оформить подписку "{selectedPlan.name}"
        </button>
      )}
    </div>
  );
}
```

### Компонент ожидания платежа

```typescript
function PaymentWaiting({ paymentId, onCancel }) {
  const [status, setStatus] = useState('pending');
  const [timeLeft, setTimeLeft] = useState(600); // 10 минут

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          onCancel();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="payment-waiting">
      <div className="waiting-content">
        <div className="spinner"></div>
        <h2>Ожидание оплаты</h2>
        <p>Завершите оплату в открывшемся окне</p>

        <div className="payment-info">
          <p>ID платежа: {paymentId}</p>
          <p>Статус: {status}</p>
          <p>Осталось времени: {formatTime(timeLeft)}</p>
        </div>

        <div className="status-indicators">
          <div className={`status-step ${status !== 'pending' ? 'completed' : 'active'}`}>
            1. Переход к оплате
          </div>
          <div className={`status-step ${status === 'success' ? 'completed' : status === 'pending' ? 'pending' : 'active'}`}>
            2. Обработка платежа
          </div>
          <div className={`status-step ${status === 'success' ? 'active' : 'pending'}`}>
            3. Активация подписки
          </div>
        </div>

        <button onClick={onCancel} className="cancel-button">
          Отменить
        </button>
      </div>
    </div>
  );
}
```

---

## 🔧 Утилиты и хуки

### Хук для подписок

```typescript
function useSubscription(userId: string) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscription = useCallback(async () => {
    try {
      setLoading(true);
      const data = await checkActiveSubscription(userId);
      setSubscription(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      fetchSubscription();
    }
  }, [userId, fetchSubscription]);

  const renewSubscription = async (plan: SubscriptionPlan) => {
    try {
      await handleSubscriptionFlow(userId, plan);
      await fetchSubscription();
    } catch (err) {
      setError(err.message);
    }
  };

  const cancelSubscription = async () => {
    if (!subscription) return;

    try {
      await api.patch(`/subscriptions/${subscription.id}/status`, {
        status: 'canceled',
      });
      await fetchSubscription();
    } catch (err) {
      setError(err.message);
    }
  };

  return {
    subscription,
    loading,
    error,
    renewSubscription,
    cancelSubscription,
    refetch: fetchSubscription,
  };
}
```

### Утилиты для статуса

```typescript
export const subscriptionUtils = {
  isActive: (subscription: Subscription) => {
    return (
      subscription.status === 'active' &&
      new Date(subscription.endDate) > new Date()
    );
  },

  isExpired: (subscription: Subscription) => {
    return (
      subscription.status === 'expired' ||
      new Date(subscription.endDate) <= new Date()
    );
  },

  daysLeft: (subscription: Subscription) => {
    const now = new Date();
    const endDate = new Date(subscription.endDate);
    const diffTime = endDate.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  },

  formatPrice: (price: number) => {
    return `${(price / 100).toFixed(2)} ₽`;
  },

  getStatusText: (status: string) => {
    const statusMap = {
      pending: 'Ожидает активации',
      active: 'Активна',
      expired: 'Истекла',
      canceled: 'Отменена',
    };
    return statusMap[status] || status;
  },
};
```

---

## 🛡 Обработка ошибок

### Глобальный обработчик ошибок

```typescript
// Интерцептор для обработки ошибок API
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || error.message;

    if (error.response?.status === 401) {
      // Токен истек
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
      return Promise.reject(new Error('Сессия истекла. Войдите заново.'));
    }

    if (error.response?.status === 403) {
      return Promise.reject(new Error('Нет прав доступа'));
    }

    if (error.response?.status === 404) {
      return Promise.reject(new Error('Ресурс не найден'));
    }

    return Promise.reject(new Error(message));
  },
);
```

### Компонент обработки ошибок

```typescript
function ErrorBoundary({ children }) {
  const [error, setError] = useState(null);

  const handleError = (error) => {
    console.error('Subscription error:', error);
    setError(error.message);
  };

  if (error) {
    return (
      <div className="error-boundary">
        <h2>Произошла ошибка</h2>
        <p>{error}</p>
        <button onClick={() => setError(null)}>
          Попробовать снова
        </button>
      </div>
    );
  }

  return children;
}
```

---

## 📱 Примеры использования

### Основной компонент приложения

```typescript
function App() {
  const [user, setUser] = useState(null);
  const { subscription, loading, renewSubscription } = useSubscription(user?.id);

  useEffect(() => {
    // Восстанавливаем пользователя из localStorage
    const savedUser = localStorage.getItem('user');
    const savedToken = localStorage.getItem('authToken');

    if (savedUser && savedToken) {
      setUser(JSON.parse(savedUser));
      api.defaults.headers.Authorization = `Bearer ${savedToken}`;
    }
  }, []);

  if (!user) {
    return <LoginForm onLogin={setUser} />;
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!subscription || !subscriptionUtils.isActive(subscription)) {
    return <SubscriptionSelector onPlanSelect={renewSubscription} />;
  }

  return (
    <ErrorBoundary>
      <MainApp user={user} subscription={subscription} />
    </ErrorBoundary>
  );
}
```

### Пример интеграции в существующее приложение

```typescript
// В вашем главном компоненте
function MainApp() {
  const { user } = useAuth();
  const { subscription, loading } = useSubscription(user?.id);

  // Проверяем подписку перед показом контента
  if (loading) return <Spinner />;

  if (!subscription || !subscriptionUtils.isActive(subscription)) {
    return <SubscriptionRequired />;
  }

  // Показываем уведомление о скором истечении
  const daysLeft = subscriptionUtils.daysLeft(subscription);
  if (daysLeft <= 7) {
    return (
      <>
        <SubscriptionExpiryWarning daysLeft={daysLeft} />
        <YourAppContent />
      </>
    );
  }

  return <YourAppContent />;
}
```

---

## 🎯 Основные моменты для реализации

### ✅ Обязательно реализовать:

1. **Авторизация с JWT токеном**
2. **Проверка активной подписки при запуске**
3. **WebSocket подключение для отслеживания платежей**
4. **Обработка всех возможных статусов**
5. **Автоматическое обновление статуса подписки**

### ⚠️ Важные нюансы:

1. **Цены в копейках** - API работает с копейками (1000 = 10₽)
2. **JWT токен обязателен** для всех запросов к API
3. **WebSocket namespace** - `/subscription-payment`
4. **Таймаут платежа** - 10 минут
5. **Периодичность проверки** - каждые 2 секунды

### 🔄 Жизненный цикл подписки:

1. `pending` → Создана, ожидает оплаты
2. `active` → Оплачена и активна
3. `expired` → Срок истек
4. `canceled` → Отменена пользователем

---

## 🧪 Тестирование

### Симуляция успешной оплаты (только для разработки)

```typescript
// Только для админов и тестирования
async function simulatePayment(paymentId: string) {
  try {
    const response = await api.post(
      `/subscriptions/payment/simulate/${paymentId}`,
    );
    console.log('Платеж симулирован:', response.data);
  } catch (error) {
    console.error('Ошибка симуляции:', error);
  }
}
```

### Проверка статуса платежа

```typescript
async function checkPaymentStatus(paymentId: string) {
  try {
    const response = await api.get(`/subscriptions/payment/${paymentId}`);
    return response.data;
  } catch (error) {
    console.error('Ошибка проверки статуса:', error);
    throw error;
  }
}
```

---

## 📞 API Endpoints

| Метод   | Endpoint                                     | Описание          |
| ------- | -------------------------------------------- | ----------------- |
| `POST`  | `/auth/login`                                | Авторизация       |
| `GET`   | `/subscriptions/user/:userId`                | Активная подписка |
| `POST`  | `/subscriptions`                             | Создать подписку  |
| `POST`  | `/subscriptions/payment/create`              | Создать платеж    |
| `GET`   | `/subscriptions/payment/:paymentId`          | Статус платежа    |
| `POST`  | `/subscriptions/payment/simulate/:paymentId` | Симуляция оплаты  |
| `PATCH` | `/subscriptions/:id/status`                  | Обновить статус   |

---

## 🚀 Готово к работе!

Этот флоу обеспечивает полную интеграцию с системой подписок. Следуйте этапам последовательно, и ваше приложение будет работать идеально с backend API.
