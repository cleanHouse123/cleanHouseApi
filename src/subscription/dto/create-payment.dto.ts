import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, IsNumber, Min, Max, IsEnum } from 'class-validator';
import { SubscriptionType } from '../entities/subscription.entity';

export class CreatePaymentDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'ID подписки для оплаты',
  })
  @IsUUID()
  subscriptionId: string;

  @ApiProperty({
    example: '456e7890-e89b-12d3-a456-426614174001',
    description: 'ID плана подписки',
  })
  @IsUUID()
  planId: string;

  @ApiProperty({
    example: 'monthly',
    description: 'Тип подписки',
    enum: SubscriptionType,
  })
  @IsEnum(SubscriptionType)
  subscriptionType: SubscriptionType;

  @ApiProperty({
    example: 100000,
    description:
      'Сумма к оплате в копейках (минимум 100 копеек, максимум 10000000 копеек)',
  })
  @IsNumber()
  @Min(100, { message: 'Минимальная сумма платежа 1 рубль (100 копеек)' })
  @Max(10000000, {
    message: 'Максимальная сумма платежа 100000 рублей (10000000 копеек)',
  })
  amount: number;
}

export class SubscriptionPaymentResponseDto {
  @ApiProperty({
    example:
      'https://mock-payment.example.com/pay/123e4567-e89b-12d3-a456-426614174000',
    description: 'Ссылка на страницу оплаты',
  })
  paymentUrl: string;

  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'ID платежа',
  })
  paymentId: string;

  @ApiProperty({
    example: 'pending',
    description: 'Статус платежа',
  })
  status: string;
}

export class PaymentCallbackDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'ID платежа',
  })
  @IsUUID()
  paymentId: string;

  @ApiProperty({
    example: 'success',
    description: 'Статус платежа',
  })
  @IsString()
  status: string;
}
