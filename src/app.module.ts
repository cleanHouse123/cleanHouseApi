import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthCheckModule } from './healthCheck/healthCheck.module';
import { User } from './user/entities/user.entity';
import { VerificationCode } from './auth/entities/verification-code.entity';
import { Order } from './order/entities/order.entity';
import { Payment } from './order/entities/payment.entity';
import { Review } from './order/entities/review.entity';
import { Subscription } from './subscription/entities/subscription.entity';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { OrderModule } from './order/order.module';
import { SubscriptionModule } from './subscription/subscription.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return {
          type: 'postgres',
          host: configService.get<string>('DATABASE_HOST'),
          port: configService.get<number>('DATABASE_PORT'),
          username: configService.get<string>('DATABASE_USER'),
          password: configService.get<string>('DATABASE_PASSWORD'),
          database: configService.get<string>('DATABASE_NAME'),
          synchronize: true,
          entities: [
            User,
            VerificationCode,
            Order,
            Payment,
            Review,
            Subscription,
          ],
        };
      },
    }),
    HealthCheckModule,
    AuthModule,
    UserModule,
    OrderModule,
    SubscriptionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
