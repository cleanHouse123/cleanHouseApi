FROM node:22-alpine

WORKDIR /app

# Копируем package.json и yarn.lock
COPY package.json yarn.lock ./

# Устанавливаем зависимости
RUN yarn install --frozen-lockfile

# Копируем исходный код
COPY . .

# Собираем приложение
RUN yarn build

# Устанавливаем переменные окружения
ENV NODE_ENV=production

# Открываем порт
EXPOSE 3000

# Запускаем приложение
CMD ["yarn", "start:prod"] 