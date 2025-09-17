# Система управления подписками

## Что сделано

Создана полная оптимизированная система управления планами подписок:

- ✅ Планы подписок хранятся в PostgreSQL
- ✅ **Цены в копейках** - никакой конвертации
- ✅ Админка для управления планами (CRUD)
- ✅ API для клиентского приложения
- ✅ Валидация платежей по реальным ценам из БД

## Backend (NestJS + TypeORM)

### Структура базы данных

Таблица `subscription_plans`:

- `id` - UUID (primary key)
- `type` - тип подписки ("monthly", "yearly")
- `name` - название подписки
- `description` - описание
- **`priceInKopecks`** - цена в копейках (integer) ⚡
- `duration` - длительность ("1 месяц", "12 месяцев")
- `features` - возможности (string[])
- `icon` - slug иконки ("calendar", "zap", "star", etc.)
- `badgeColor` - цвет значка ("blue", "purple", "green", etc.)
- `popular` - популярная подписка (boolean)
- `createdAt`, `updatedAt` - даты

### Созданные файлы

```
src/subscription/
├── entities/subscription-plan.entity.ts
├── dto/create-subscription-plan.dto.ts
├── dto/update-subscription-plan.dto.ts
├── dto/subscription-plan-response.dto.ts
├── services/subscription-plans.service.ts
├── controllers/subscription-plans.controller.ts
└── subscription.module.ts (обновлен)

src/migrations/
├── 1734432000000-CreateSubscriptionPlansTable.ts
├── 1734432000002-UpdatePriceToKopecks.ts
└── 1734432000003-SeedSubscriptionPlans.ts
```

## API Endpoints

### 1. Получить все планы подписок

```
GET /subscription-plans

Требования: Нет авторизации
Ответ: SubscriptionPlan[]
Пример ответа:
{
  "id": "uuid",
  "name": "Месячная подписка",
  "priceInKopecks": 100000,  // 1000 рублей
  "type": "monthly",
  "features": [...],
  "popular": false
}
```

### 2. Создать новый план (только админы)

```
POST /subscription-plans

Требования: JWT токен админа
Body:
{
  "type": "monthly",
  "name": "Базовый план",
  "description": "Описание плана",
  "priceInKopecks": 100000,  // В КОПЕЙКАХ!
  "duration": "1 месяц",
  "features": ["Функция 1", "Функция 2"],
  "icon": "calendar",
  "badgeColor": "blue",
  "popular": false
}
```

### 3. Создать платеж с валидацией

```
POST /subscriptions/payment/create

Требования: JWT токен пользователя
Body:
{
  "subscriptionId": "uuid-подписки",
  "planId": "uuid-плана",
  "subscriptionType": "monthly",
  "amount": 100000  // Должно точно совпадать с priceInKopecks
}
```

## Интеграция с фронтендом

### Админка (React)

#### 1. Получение планов

```typescript
const fetchPlans = async () => {
  const response = await fetch('/subscription-plans');
  const plans = await response.json();
  return plans; // priceInKopecks уже в копейках
};
```

#### 2. Создание плана

```typescript
const createPlan = async (planData) => {
  const response = await fetch('/subscription-plans', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      ...planData,
      priceInKopecks: Math.round(planData.priceInRubles * 100), // Конвертируем в форме
    }),
  });
  return response.json();
};
```

#### 3. Отображение в таблице

```typescript
const PlanTable = ({ plans }) => (
  <table>
    <tbody>
      {plans.map(plan => (
        <tr key={plan.id}>
          <td>{plan.name}</td>
          <td>₽{(plan.priceInKopecks / 100).toFixed(2)}</td> {/* Показываем в рублях */}
          <td>{plan.duration}</td>
          <td>{plan.popular ? 'Да' : 'Нет'}</td>
        </tr>
      ))}
    </tbody>
  </table>
);
```

#### 4. Форма создания/редактирования

```typescript
const PlanForm = ({ plan, onSave }) => {
  const [formData, setFormData] = useState({
    name: plan?.name || '',
    priceInRubles: plan ? plan.priceInKopecks / 100 : 0, // Работаем в рублях в форме
    duration: plan?.duration || '',
    // ... остальные поля
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...formData,
      priceInKopecks: Math.round(formData.priceInRubles * 100) // Конвертируем обратно
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="number"
        step="0.01"
        value={formData.priceInRubles}
        onChange={(e) => setFormData({...formData, priceInRubles: parseFloat(e.target.value)})}
        placeholder="Цена в рублях"
      />
      {/* ... остальные поля */}
    </form>
  );
};
```

### Клиентское приложение (React)

#### 1. Получение планов для выбора

```typescript
const SubscriptionPlans = () => {
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);

  useEffect(() => {
    fetch('/subscription-plans')
      .then(res => res.json())
      .then(setPlans);
  }, []);

  const handleSelectPlan = (plan) => {
    setSelectedPlan(plan);
  };

  return (
    <div className="plans-grid">
      {plans.map(plan => (
        <PlanCard
          key={plan.id}
          plan={plan}
          onSelect={handleSelectPlan}
          isSelected={selectedPlan?.id === plan.id}
        />
      ))}
    </div>
  );
};
```

#### 2. Карточка плана

```typescript
const PlanCard = ({ plan, onSelect, isSelected }) => (
  <div className={`plan-card ${isSelected ? 'selected' : ''} ${plan.popular ? 'popular' : ''}`}>
    {plan.popular && <div className="badge">🔥 Популярная</div>}

    <h3>{plan.name}</h3>
    <div className="price">
      <span className="amount">₽{(plan.priceInKopecks / 100).toFixed(0)}</span>
      <span className="period">/ {plan.duration}</span>
    </div>

    <p>{plan.description}</p>

    <ul className="features">
      {plan.features.map((feature, i) => (
        <li key={i}>✅ {feature}</li>
      ))}
    </ul>

    <button
      onClick={() => onSelect(plan)}
      className={isSelected ? 'selected' : 'primary'}
    >
      {isSelected ? 'Выбрано' : 'Выбрать план'}
    </button>
  </div>
);
```

#### 3. Создание платежа

```typescript
const createPayment = async (plan, subscriptionId) => {
  const response = await fetch('/subscriptions/payment/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      subscriptionId,
      planId: plan.id,
      subscriptionType: plan.type,
      amount: plan.priceInKopecks, // Используем напрямую без конвертации!
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message); // Покажет детальную ошибку валидации
  }

  return response.json(); // { paymentUrl, paymentId, status }
};
```

#### 4. Обработка выбора плана

```typescript
const handleProceedToPayment = async () => {
  if (!selectedPlan) return;

  try {
    // Получаем ID активной подписки пользователя
    const subscriptionId = await getCurrentUserSubscriptionId();

    // Создаем платеж с точной суммой из БД
    const paymentData = await createPayment(selectedPlan, subscriptionId);

    // Перенаправляем на оплату
    window.location.href = paymentData.paymentUrl;
  } catch (error) {
    alert(`Ошибка создания платежа: ${error.message}`);
  }
};
```

## Иконки и цвета

### Доступные иконки

```typescript
const iconMap = {
  calendar: <CalendarIcon />,
  zap: <ZapIcon />,
  star: <StarIcon />,
  crown: <CrownIcon />,
  diamond: <DiamondIcon />,
  shield: <ShieldIcon />,
  rocket: <RocketIcon />,
  heart: <HeartIcon />
};
```

### Цвета значков

```css
.badge-blue {
  background: #dbeafe;
  color: #1e40af;
}
.badge-green {
  background: #dcfce7;
  color: #166534;
}
.badge-purple {
  background: #f3e8ff;
  color: #7c3aed;
}
.badge-yellow {
  background: #fef3c7;
  color: #d97706;
}
.badge-red {
  background: #fee2e2;
  color: #dc2626;
}
```

## Ключевые особенности

### ✅ Цены в копейках

- **В БД:** `priceInKopecks: 100000` (integer)
- **В админке:** Показываем как `₽1000.00` (делим на 100)
- **В API:** Передаем `100000` без изменений

### ✅ Простая валидация

- Фронтенд получает `priceInKopecks` из `/subscription-plans`
- Передает эту же сумму в `amount` при создании платежа
- Бэкенд сравнивает напрямую: `amount === plan.priceInKopecks`

### ✅ Никаких лишних endpoint'ов

- Используется только основной `/subscription-plans`
- Вся информация для оплаты уже есть в планах

### ✅ Безопасность

- Создание/редактирование планов только для админов
- Получение планов доступно всем
- Валидация суммы по реальным данным из БД

Теперь система готова к интеграции! 🚀
