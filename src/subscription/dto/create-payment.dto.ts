import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, IsEnum, IsOptional } from 'class-validator';
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

  // amount убран - цена вычисляется на сервере на основе плана и прав на бесплатную подписку
}

export class SubscriptionPaymentResponseDto {
  @ApiProperty({
    example:
      'https://mock-payment.example.com/pay/123e4567-e89b-12d3-a456-426614174000',
    description: 'Ссылка на страницу оплаты (null если подписка активирована бесплатно)',
    nullable: true,
  })
  @IsOptional()
  paymentUrl: string | null;

  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'ID платежа',
  })
  paymentId: string;

  @ApiProperty({
    example: 'pending',
    description: 'Статус платежа (success если подписка активирована бесплатно)',
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
