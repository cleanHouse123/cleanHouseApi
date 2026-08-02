FROM node:22-slim AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci --legacy-peer-deps

COPY . .

RUN npm run build

FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./

RUN npm ci --omit=dev --legacy-peer-deps

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/firebase-service-account.json.base64 ./firebase-service-account.json.base64

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health-check/', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["npm", "run", "start:prod"]
