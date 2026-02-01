FROM node:22-slim

WORKDIR /app

# Копируем package.json и yarn.lock
COPY package.json yarn.lock ./

# Устанавливаем зависимости
RUN yarn install --frozen-lockfile

# Копируем исходный код
COPY . .

# Собираем приложение
RUN yarn build

# Устанавливаем переменные окружения (fallback значения)
ENV NODE_ENV=production
ENV YOOKASSA_SHOP_ID=1193587
ENV YOOKASSA_SECRET_KEY=test_qXKh3h-nMuuiZuKqowskhCczKnwEDCxlkix8Eo1wEJQ
ENV BASE_URL=https://cleanhouse123-cleanhouseapi-4d55.twc1.net
ENV FRONTEND_URL=https://xn--80ad4adfbofbt7f.xn--p1ai

EXPOSE 3000

# Запускаем приложение
CMD ["yarn", "start:prod"] 