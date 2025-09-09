import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { OrderPaymentService } from '../services/order-payment.service';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  namespace: '/order-payment',
})
export class OrderPaymentGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(OrderPaymentGateway.name);
  private paymentCheckIntervals = new Map<string, NodeJS.Timeout>();

  constructor(private readonly orderPaymentService: OrderPaymentService) {}

  // Обработка подключения клиента
  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  // Обработка отключения клиента
  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Отправка уведомления о успешной оплате
  notifyPaymentSuccess(paymentId: string, orderId: string) {
    const roomName = `order_payment_${paymentId}`;
    this.logger.log(
      `[ORDER PAYMENT SUCCESS] PaymentId: ${paymentId}, OrderId: ${orderId}, Room: ${roomName}`,
    );

    this.server.to(roomName).emit('order_payment_success', {
      paymentId,
      orderId,
      message: 'Заказ успешно оплачен!',
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`[ORDER PAYMENT SUCCESS] Event sent to room: ${roomName}`);
  }

  // Отправка уведомления об ошибке оплаты
  notifyPaymentError(paymentId: string, orderId: string, error: string) {
    const roomName = `order_payment_${paymentId}`;
    this.logger.error(
      `[ORDER PAYMENT ERROR] PaymentId: ${paymentId}, OrderId: ${orderId}, Error: ${error}, Room: ${roomName}`,
    );

    this.server.to(roomName).emit('order_payment_error', {
      paymentId,
      orderId,
      error,
      timestamp: new Date().toISOString(),
    });

    this.logger.error(`[ORDER PAYMENT ERROR] Event sent to room: ${roomName}`);
  }

  // Подключение клиента
  @SubscribeMessage('join_order_payment_room')
  handleJoinRoom(
    @MessageBody() data: { userId: string; paymentId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomName = `order_payment_${data.paymentId}`;
    this.logger.log(
      `[ORDER JOIN ROOM] Client: ${client.id}, UserId: ${data.userId}, PaymentId: ${data.paymentId}, Room: ${roomName}`,
    );

    client.join(roomName);
    this.logger.log(
      `[ORDER JOIN ROOM] Client ${client.id} successfully joined room: ${roomName}`,
    );

    // Запускаем периодическую проверку статуса платежа
    this.logger.log(
      `[ORDER JOIN ROOM] Starting payment status check for PaymentId: ${data.paymentId}`,
    );
    this.startPaymentStatusCheck(data.paymentId, roomName);

    return { message: 'Подключен к комнате оплаты заказа', room: roomName };
  }

  // Отключение клиента
  @SubscribeMessage('leave_order_payment_room')
  handleLeaveRoom(
    @MessageBody() data: { userId: string; paymentId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomName = `order_payment_${data.paymentId}`;
    this.logger.log(
      `[ORDER LEAVE ROOM] Client: ${client.id}, UserId: ${data.userId}, PaymentId: ${data.paymentId}, Room: ${roomName}`,
    );

    client.leave(roomName);
    this.logger.log(
      `[ORDER LEAVE ROOM] Client ${client.id} successfully left room: ${roomName}`,
    );

    // Останавливаем проверку статуса платежа
    this.logger.log(
      `[ORDER LEAVE ROOM] Stopping payment status check for PaymentId: ${data.paymentId}`,
    );
    this.stopPaymentStatusCheck(data.paymentId);

    return { message: 'Отключен от комнаты оплаты заказа' };
  }

  // Запуск периодической проверки статуса платежа
  private startPaymentStatusCheck(paymentId: string, roomName: string) {
    // Останавливаем предыдущую проверку, если она была
    this.stopPaymentStatusCheck(paymentId);
    this.logger.log(
      `[ORDER STATUS CHECK] Starting periodic check for PaymentId: ${paymentId}, Room: ${roomName}`,
    );

    let lastStatus: string | null = null;
    let checkCount = 0;
    const maxChecks = 150; // Максимум 5 минут проверок (150 * 2 сек = 300 сек)

    const interval = setInterval(async () => {
      try {
        const payment = await this.orderPaymentService.getPayment(paymentId);

        if (!payment) {
          this.logger.warn(
            `[ORDER STATUS CHECK] Order payment ${paymentId} not found, stopping check`,
          );
          this.stopPaymentStatusCheck(paymentId);
          return;
        }

        // Логируем только при изменении статуса или каждые 10 проверок
        if (payment.status !== lastStatus || checkCount % 10 === 0) {
          this.logger.log(
            `[ORDER STATUS CHECK] PaymentId: ${paymentId}, Status: ${payment.status}, Check: ${checkCount}, Room: ${roomName}`,
          );
          lastStatus = payment.status;
        }

        checkCount++;

        // Если превышено максимальное количество проверок, останавливаем
        if (checkCount >= maxChecks) {
          this.logger.warn(
            `[ORDER STATUS CHECK] Order payment ${paymentId} check timeout after ${maxChecks} checks, stopping check`,
          );
          this.stopPaymentStatusCheck(paymentId);
          return;
        }

        // Отправляем текущий статус платежа
        this.server.to(roomName).emit('order_payment_status_update', {
          paymentId,
          status: payment.status,
          timestamp: new Date().toISOString(),
        });
        this.logger.log(
          `[ORDER STATUS CHECK] Status update sent to room: ${roomName}`,
        );

        // Если платеж завершен (успешно или с ошибкой), останавливаем проверку
        if (payment.status === 'success' || payment.status === 'failed') {
          this.logger.log(
            `[ORDER STATUS CHECK] Order payment ${paymentId} completed with status: ${payment.status}, stopping check`,
          );
          this.stopPaymentStatusCheck(paymentId);

          // Отправляем финальное уведомление
          if (payment.status === 'success') {
            this.logger.log(
              `[ORDER STATUS CHECK] Sending success notification for PaymentId: ${paymentId}`,
            );
            this.server.to(roomName).emit('order_payment_success', {
              paymentId,
              orderId: payment.orderId,
              message: 'Заказ успешно оплачен!',
              timestamp: new Date().toISOString(),
            });
          } else {
            this.logger.log(
              `[ORDER STATUS CHECK] Sending error notification for PaymentId: ${paymentId}`,
            );
            this.server.to(roomName).emit('order_payment_error', {
              paymentId,
              orderId: payment.orderId,
              error: 'Оплата заказа не прошла',
              timestamp: new Date().toISOString(),
            });
          }
        }
      } catch (error) {
        this.logger.error(
          `[ORDER STATUS CHECK] Error checking order payment ${paymentId}:`,
          error,
        );
      }
    }, 2000); // Проверяем каждые 2 секунды

    this.paymentCheckIntervals.set(paymentId, interval);
    this.logger.log(
      `[ORDER STATUS CHECK] Interval set for PaymentId: ${paymentId}`,
    );
  }

  // Остановка периодической проверки статуса платежа
  private stopPaymentStatusCheck(paymentId: string) {
    const interval = this.paymentCheckIntervals.get(paymentId);
    if (interval) {
      clearInterval(interval);
      this.paymentCheckIntervals.delete(paymentId);
      this.logger.log(
        `[ORDER STATUS CHECK] Stopped order payment status check for PaymentId: ${paymentId}`,
      );
    } else {
      this.logger.log(
        `[ORDER STATUS CHECK] No active interval found for PaymentId: ${paymentId}`,
      );
    }
  }
}
