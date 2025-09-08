import { NestFactory, Reflector } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { TimezoneInterceptor } from './shared/interceptors/timezone.interceptor';

async function bootstrap() {
  // Устанавливаем часовой пояс
  process.env.TZ = 'Europe/Moscow';

  // Дополнительная настройка времени для Node.js
  const moment = require('moment-timezone');
  moment.tz.setDefault('Europe/Moscow');

  const app = await NestFactory.create(AppModule);
  app.enableCors({
    allowedHeaders: '*',
    origin: '*',
    credentials: false,
  });
  const config = new DocumentBuilder()
    .setTitle('Backend')
    .setDescription('The mussor app API description')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT',
    )
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
    }),
  );
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
    new TimezoneInterceptor(),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}
bootstrap();
