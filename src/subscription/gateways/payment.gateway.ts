import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { PaymentService } from '../services/payment.service';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class PaymentGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(PaymentGateway.name);
  private paymentCheckIntervals = new Map<string, NodeJS.Timeout>();

  constructor(private readonly paymentService: PaymentService) {}

  // Отправка уведомления о успешной оплате
  notifyPaymentSuccess(paymentId: string, subscriptionId: string) {
    const roomName = `payment_${paymentId}`;
    this.server.to(roomName).emit('payment_success', {
      paymentId,
      subscriptionId,
      message: 'Подписка успешно оформлена!',
      timestamp: new Date().toISOString(),
    });
  }

  // Отправка уведомления об ошибке оплаты
  notifyPaymentError(paymentId: string, subscriptionId: string, error: string) {
    const roomName = `payment_${paymentId}`;
    this.server.to(roomName).emit('payment_error', {
      paymentId,
      subscriptionId,
      error,
      timestamp: new Date().toISOString(),
    });
  }

  // Подключение клиента
  @SubscribeMessage('join_payment_room')
  handleJoinRoom(
    @MessageBody() data: { userId: string; paymentId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomName = `payment_${data.paymentId}`;
    client.join(roomName);

    this.logger.log(`Client ${client.id} joined payment room: ${roomName}`);

    // Запускаем периодическую проверку статуса платежа
    this.startPaymentStatusCheck(data.paymentId, roomName);

    return { message: 'Подключен к комнате оплаты', room: roomName };
  }

  // Отключение клиента
  @SubscribeMessage('leave_payment_room')
  handleLeaveRoom(
    @MessageBody() data: { userId: string; paymentId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomName = `payment_${data.paymentId}`;
    client.leave(roomName);

    this.logger.log(`Client ${client.id} left payment room: ${roomName}`);

    // Останавливаем проверку статуса платежа
    this.stopPaymentStatusCheck(data.paymentId);

    return { message: 'Отключен от комнаты оплаты' };
  }

  // Запуск периодической проверки статуса платежа
  private startPaymentStatusCheck(paymentId: string, roomName: string) {
    // Останавливаем предыдущую проверку, если она была
    this.stopPaymentStatusCheck(paymentId);

    const interval = setInterval(async () => {
      try {
        const payment = this.paymentService.getPayment(paymentId);

        if (!payment) {
          this.logger.warn(`Payment ${paymentId} not found`);
          this.stopPaymentStatusCheck(paymentId);
          return;
        }

        this.logger.log(
          `Checking payment ${paymentId} status: ${payment.status}`,
        );

        // Отправляем текущий статус платежа
        this.server.to(roomName).emit('payment_status_update', {
          paymentId,
          status: payment.status,
          timestamp: new Date().toISOString(),
        });

        // Если платеж завершен (успешно или с ошибкой), останавливаем проверку
        if (payment.status === 'success' || payment.status === 'failed') {
          this.logger.log(
            `Payment ${paymentId} completed with status: ${payment.status}`,
          );
          this.stopPaymentStatusCheck(paymentId);

          // Отправляем финальное уведомление
          if (payment.status === 'success') {
            this.server.to(roomName).emit('payment_success', {
              paymentId,
              subscriptionId: payment.subscriptionId,
              message: 'Оплата прошла успешно! Подписка активирована.',
              timestamp: new Date().toISOString(),
            });
          } else {
            this.server.to(roomName).emit('payment_error', {
              paymentId,
              subscriptionId: payment.subscriptionId,
              error: 'Оплата не прошла',
              timestamp: new Date().toISOString(),
            });
          }
        }
      } catch (error) {
        this.logger.error(`Error checking payment ${paymentId}:`, error);
      }
    }, 2000); // Проверяем каждые 2 секунды

    this.paymentCheckIntervals.set(paymentId, interval);
  }

  // Остановка периодической проверки статуса платежа
  private stopPaymentStatusCheck(paymentId: string) {
    const interval = this.paymentCheckIntervals.get(paymentId);
    if (interval) {
      clearInterval(interval);
      this.paymentCheckIntervals.delete(paymentId);
      this.logger.log(`Stopped payment status check for ${paymentId}`);
    }
  }
}
