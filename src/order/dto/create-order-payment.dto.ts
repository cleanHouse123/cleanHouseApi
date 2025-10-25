import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class CreateOrderPaymentDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'ID заказа для оплаты',
  })
  @IsUUID()
  orderId: string;

  @ApiProperty({
    example: 20000,
    description: 'Сумма к оплате в копейках (200 рублей = 20000 копеек)',
  })
  amount: number;
}

export class OrderPaymentResponseDto {
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

export class OrderPaymentCallbackDto {
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
