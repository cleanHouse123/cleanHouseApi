import { NestFactory, Reflector } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';

async function bootstrap() {
  process.env.TZ = 'UTC';

  const moment = require('moment-timezone');
  moment.tz.setDefault('UTC');

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
    // new ClassSerializerInterceptor(app.get(Reflector), {
    //   excludeExtraneousValues: true,
    // }),
    // new TimezoneInterceptor(), // Отключено для работы с UTC
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}
bootstrap();
