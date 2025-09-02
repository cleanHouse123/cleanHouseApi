FROM node:22-alpine

WORKDIR /app

COPY *.json ./

RUN yarn

COPY . .

RUN yarn build

ARG NODE_ENV=development
COPY .env.$NODE_ENV .env

EXPOSE 3000

# CMD ["sh", "-c", "yarn migration:run && yarn start:prod"]   это уже на прод будет 
CMD ["sh", "-c", "yarn start:prod"] 