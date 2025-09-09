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
    methods: ['GET', 'POST'],
    credentials: true,
  },
  namespace: '/subscription-payment',
})
export class PaymentGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(PaymentGateway.name);
  private paymentCheckIntervals = new Map<string, NodeJS.Timeout>();

  constructor(private readonly paymentService: PaymentService) {}

  // Обработка подключения клиента
  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  // Обработка отключения клиента
  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Отправка уведомления о успешной оплате
  notifyPaymentSuccess(paymentId: string, subscriptionId: string) {
    const roomName = `payment_${paymentId}`;
    this.logger.log(
      `[SUBSCRIPTION PAYMENT SUCCESS] PaymentId: ${paymentId}, SubscriptionId: ${subscriptionId}, Room: ${roomName}`,
    );

    this.server.to(roomName).emit('payment_success', {
      paymentId,
      subscriptionId,
      message: 'Подписка успешно оформлена!',
      timestamp: new Date().toISOString(),
    });

    this.logger.log(
      `[SUBSCRIPTION PAYMENT SUCCESS] Event sent to room: ${roomName}`,
    );
  }

  // Отправка уведомления об ошибке оплаты
  notifyPaymentError(paymentId: string, subscriptionId: string, error: string) {
    const roomName = `payment_${paymentId}`;
    this.logger.error(
      `[SUBSCRIPTION PAYMENT ERROR] PaymentId: ${paymentId}, SubscriptionId: ${subscriptionId}, Error: ${error}, Room: ${roomName}`,
    );

    this.server.to(roomName).emit('payment_error', {
      paymentId,
      subscriptionId,
      error,
      timestamp: new Date().toISOString(),
    });

    this.logger.error(
      `[SUBSCRIPTION PAYMENT ERROR] Event sent to room: ${roomName}`,
    );
  }

  // Подключение клиента
  @SubscribeMessage('join_payment_room')
  handleJoinRoom(
    @MessageBody() data: { userId: string; paymentId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomName = `payment_${data.paymentId}`;
    this.logger.log(
      `[SUBSCRIPTION JOIN ROOM] Client: ${client.id}, UserId: ${data.userId}, PaymentId: ${data.paymentId}, Room: ${roomName}`,
    );

    client.join(roomName);
    this.logger.log(
      `[SUBSCRIPTION JOIN ROOM] Client ${client.id} successfully joined room: ${roomName}`,
    );

    // Запускаем периодическую проверку статуса платежа
    this.logger.log(
      `[SUBSCRIPTION JOIN ROOM] Starting payment status check for PaymentId: ${data.paymentId}`,
    );
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
    this.logger.log(
      `[SUBSCRIPTION LEAVE ROOM] Client: ${client.id}, UserId: ${data.userId}, PaymentId: ${data.paymentId}, Room: ${roomName}`,
    );

    client.leave(roomName);
    this.logger.log(
      `[SUBSCRIPTION LEAVE ROOM] Client ${client.id} successfully left room: ${roomName}`,
    );

    // Останавливаем проверку статуса платежа
    this.logger.log(
      `[SUBSCRIPTION LEAVE ROOM] Stopping payment status check for PaymentId: ${data.paymentId}`,
    );
    this.stopPaymentStatusCheck(data.paymentId);

    return { message: 'Отключен от комнаты оплаты' };
  }

  // Запуск периодической проверки статуса платежа
  private startPaymentStatusCheck(paymentId: string, roomName: string) {
    // Останавливаем предыдущую проверку, если она была
    this.stopPaymentStatusCheck(paymentId);
    this.logger.log(
      `[SUBSCRIPTION STATUS CHECK] Starting periodic check for PaymentId: ${paymentId}, Room: ${roomName}`,
    );

    const interval = setInterval(async () => {
      try {
        const payment = this.paymentService.getPayment(paymentId);

        if (!payment) {
          this.logger.warn(
            `[SUBSCRIPTION STATUS CHECK] Payment ${paymentId} not found, stopping check`,
          );
          this.stopPaymentStatusCheck(paymentId);
          return;
        }

        this.logger.log(
          `[SUBSCRIPTION STATUS CHECK] PaymentId: ${paymentId}, Status: ${payment.status}, Room: ${roomName}`,
        );

        // Отправляем текущий статус платежа
        this.server.to(roomName).emit('payment_status_update', {
          paymentId,
          status: payment.status,
          timestamp: new Date().toISOString(),
        });
        this.logger.log(
          `[SUBSCRIPTION STATUS CHECK] Status update sent to room: ${roomName}`,
        );

        // Если платеж завершен (успешно или с ошибкой), останавливаем проверку
        if (payment.status === 'success' || payment.status === 'failed') {
          this.logger.log(
            `[SUBSCRIPTION STATUS CHECK] Payment ${paymentId} completed with status: ${payment.status}, stopping check`,
          );
          this.stopPaymentStatusCheck(paymentId);

          // Отправляем финальное уведомление
          if (payment.status === 'success') {
            this.logger.log(
              `[SUBSCRIPTION STATUS CHECK] Sending success notification for PaymentId: ${paymentId}`,
            );
            this.server.to(roomName).emit('payment_success', {
              paymentId,
              subscriptionId: payment.subscriptionId,
              message: 'Оплата прошла успешно! Подписка активирована.',
              timestamp: new Date().toISOString(),
            });
          } else {
            this.logger.log(
              `[SUBSCRIPTION STATUS CHECK] Sending error notification for PaymentId: ${paymentId}`,
            );
            this.server.to(roomName).emit('payment_error', {
              paymentId,
              subscriptionId: payment.subscriptionId,
              error: 'Оплата не прошла',
              timestamp: new Date().toISOString(),
            });
          }
        }
      } catch (error) {
        this.logger.error(
          `[SUBSCRIPTION STATUS CHECK] Error checking payment ${paymentId}:`,
          error,
        );
      }
    }, 2000); // Проверяем каждые 2 секунды

    this.paymentCheckIntervals.set(paymentId, interval);
    this.logger.log(
      `[SUBSCRIPTION STATUS CHECK] Interval set for PaymentId: ${paymentId}`,
    );
  }

  // Остановка периодической проверки статуса платежа
  private stopPaymentStatusCheck(paymentId: string) {
    const interval = this.paymentCheckIntervals.get(paymentId);
    if (interval) {
      clearInterval(interval);
      this.paymentCheckIntervals.delete(paymentId);
      this.logger.log(
        `[SUBSCRIPTION STATUS CHECK] Stopped payment status check for PaymentId: ${paymentId}`,
      );
    } else {
      this.logger.log(
        `[SUBSCRIPTION STATUS CHECK] No active interval found for PaymentId: ${paymentId}`,
      );
    }
  }
}
