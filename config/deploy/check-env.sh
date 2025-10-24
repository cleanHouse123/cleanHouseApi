#!/bin/bash

echo "=== Проверка переменных окружения на сервере ==="

# Проверяем .env.production файл
ssh root@213.171.8.18 'cd /root/projects/backend && echo "=== Содержимое .env.production ===" && cat .env.production | grep YOOKASSA'

# Проверяем переменные в контейнере
ssh root@213.171.8.18 'cd /root/projects/backend && echo "=== Переменные в контейнере ===" && docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec -T app env | grep YOOKASSA'

echo "=== Проверка завершена ==="
