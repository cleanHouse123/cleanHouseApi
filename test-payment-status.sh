#!/bin/bash

# Тестирование API статуса платежей
BASE_URL="http://localhost:3000"
PAYMENT_ID="34f5753f-e8d8-4adf-b7dd-f319054de6fc"

echo "🧪 Тестирование API статуса платежей"
echo "=================================="
echo ""

# Тест 1: Проверка статуса платежа
echo "1️⃣ Проверка статуса платежа:"
echo "GET $BASE_URL/payment-status/$PAYMENT_ID"
echo ""

response=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/payment-status/$PAYMENT_ID")
http_code=$(echo "$response" | grep "HTTP_CODE:" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_CODE:/d')

echo "HTTP Status: $http_code"
echo "Response:"
echo "$body" | jq . 2>/dev/null || echo "$body"
echo ""

# Тест 2: Определение типа платежа
echo "2️⃣ Определение типа платежа:"
echo "GET $BASE_URL/payment-status/$PAYMENT_ID/type"
echo ""

response=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/payment-status/$PAYMENT_ID/type")
http_code=$(echo "$response" | grep "HTTP_CODE:" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_CODE:/d')

echo "HTTP Status: $http_code"
echo "Response:"
echo "$body" | jq . 2>/dev/null || echo "$body"
echo ""

# Тест 3: Неверный UUID
echo "3️⃣ Тест с неверным UUID:"
echo "GET $BASE_URL/payment-status/invalid-uuid"
echo ""

response=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/payment-status/invalid-uuid")
http_code=$(echo "$response" | grep "HTTP_CODE:" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_CODE:/d')

echo "HTTP Status: $http_code"
echo "Response:"
echo "$body" | jq . 2>/dev/null || echo "$body"
echo ""

echo "✅ Тестирование завершено!"
