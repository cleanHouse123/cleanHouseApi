import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'ID подписки для оплаты',
  })
  @IsUUID()
  subscriptionId: string;

  @ApiProperty({
    example: 'monthly',
    description: 'Тип подписки',
  })
  @IsString()
  subscriptionType: string;

  @ApiProperty({
    example: 1000,
    description: 'Сумма к оплате в копейках',
  })
  amount: number;
}

export class PaymentResponseDto {
  @ApiProperty({
    example: 'https://mock-payment.example.com/pay/123e4567-e89b-12d3-a456-426614174000',
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
