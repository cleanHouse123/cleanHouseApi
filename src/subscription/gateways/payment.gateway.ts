import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class PaymentGateway {
  @WebSocketServer()
  server: Server;

  // Отправка уведомления о успешной оплате
  notifyPaymentSuccess(userId: string, subscriptionId: string) {
    this.server.emit('payment_success', {
      userId,
      subscriptionId,
      message: 'Подписка успешно оформлена!',
      timestamp: new Date().toISOString(),
    });
  }

  // Отправка уведомления об ошибке оплаты
  notifyPaymentError(userId: string, subscriptionId: string, error: string) {
    this.server.emit('payment_error', {
      userId,
      subscriptionId,
      error,
      timestamp: new Date().toISOString(),
    });
  }

  // Подключение клиента
  @SubscribeMessage('join_payment_room')
  handleJoinRoom(
    @MessageBody() data: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`user_${data.userId}`);
    return { message: 'Подключен к комнате оплаты' };
  }

  // Отключение клиента
  @SubscribeMessage('leave_payment_room')
  handleLeaveRoom(
    @MessageBody() data: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(`user_${data.userId}`);
    return { message: 'Отключен от комнаты оплаты' };
  }
}
