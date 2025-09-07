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
  },
})
export class OrderPaymentGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(OrderPaymentGateway.name);
  private paymentCheckIntervals = new Map<string, NodeJS.Timeout>();

  constructor(private readonly orderPaymentService: OrderPaymentService) {}

  // Отправка уведомления о успешной оплате
  notifyPaymentSuccess(userId: string, orderId: string) {
    this.server.emit('order_payment_success', {
      userId,
      orderId,
      message: 'Заказ успешно оплачен!',
      timestamp: new Date().toISOString(),
    });
  }

  // Отправка уведомления об ошибке оплаты
  notifyPaymentError(userId: string, orderId: string, error: string) {
    this.server.emit('order_payment_error', {
      userId,
      orderId,
      error,
      timestamp: new Date().toISOString(),
    });
  }

  // Подключение клиента
  @SubscribeMessage('join_order_payment_room')
  handleJoinRoom(
    @MessageBody() data: { userId: string; paymentId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomName = `order_payment_${data.paymentId}`;
    client.join(roomName);
    
    this.logger.log(`Client ${client.id} joined order payment room: ${roomName}`);
    
    // Запускаем периодическую проверку статуса платежа
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
    client.leave(roomName);
    
    this.logger.log(`Client ${client.id} left order payment room: ${roomName}`);
    
    // Останавливаем проверку статуса платежа
    this.stopPaymentStatusCheck(data.paymentId);
    
    return { message: 'Отключен от комнаты оплаты заказа' };
  }

  // Запуск периодической проверки статуса платежа
  private startPaymentStatusCheck(paymentId: string, roomName: string) {
    // Останавливаем предыдущую проверку, если она была
    this.stopPaymentStatusCheck(paymentId);

    const interval = setInterval(async () => {
      try {
        const payment = this.orderPaymentService.getPayment(paymentId);
        
        if (!payment) {
          this.logger.warn(`Order payment ${paymentId} not found`);
          this.stopPaymentStatusCheck(paymentId);
          return;
        }

        this.logger.log(`Checking order payment ${paymentId} status: ${payment.status}`);

        // Отправляем текущий статус платежа
        this.server.to(roomName).emit('order_payment_status_update', {
          paymentId,
          status: payment.status,
          timestamp: new Date().toISOString(),
        });

        // Если платеж завершен (успешно или с ошибкой), останавливаем проверку
        if (payment.status === 'success' || payment.status === 'failed') {
          this.logger.log(`Order payment ${paymentId} completed with status: ${payment.status}`);
          this.stopPaymentStatusCheck(paymentId);
          
          // Отправляем финальное уведомление
          if (payment.status === 'success') {
            this.server.to(roomName).emit('order_payment_success', {
              paymentId,
              orderId: payment.orderId,
              message: 'Заказ успешно оплачен!',
              timestamp: new Date().toISOString(),
            });
          } else {
            this.server.to(roomName).emit('order_payment_error', {
              paymentId,
              orderId: payment.orderId,
              error: 'Оплата заказа не прошла',
              timestamp: new Date().toISOString(),
            });
          }
        }
      } catch (error) {
        this.logger.error(`Error checking order payment ${paymentId}:`, error);
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
      this.logger.log(`Stopped order payment status check for ${paymentId}`);
    }
  }
}
