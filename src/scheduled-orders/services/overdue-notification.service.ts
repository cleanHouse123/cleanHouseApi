import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, Not, IsNull } from 'typeorm';
import { Order, OrderStatus } from '../../order/entities/order.entity';
import { FcmService } from '../../fcm/fcm.service';

@Injectable()
export class OverdueNotificationService {
  private readonly logger = new Logger(OverdueNotificationService.name);
  private notifiedOrders = new Set<string>(); // Для отслеживания уже уведомленных заказов

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    private fcmService: FcmService,
  ) {}

  // Проверяем каждые 5 минут
  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkOverdueOrders() {
    try {
      this.logger.log('Проверка просроченных заказов...');

      const now = new Date();

      // Находим заказы, которые просрочены:
      // - scheduledAt в прошлом
      // - статус ASSIGNED или IN_PROGRESS
      // - есть назначенный курьер
      const overdueOrders = await this.orderRepository.find({
        where: {
          scheduledAt: LessThan(now),
          status: Not(OrderStatus.DONE),
          currierId: Not(IsNull()),
        },
        relations: ['currier', 'customer'],
      });

      this.logger.log(`Найдено ${overdueOrders.length} просроченных заказов`);

      for (const order of overdueOrders) {
        // Пропускаем если уже уведомляли
        if (this.notifiedOrders.has(order.id)) {
          continue;
        }

        // Вычисляем просрочку
        const scheduledTime = new Date(order.scheduledAt);
        const diffMs = now.getTime() - scheduledTime.getTime();
        const overdueMinutes = Math.floor(diffMs / (1000 * 60));

        // Уведомляем только если просрочка больше 10 минут
        if (overdueMinutes < 10) {
          continue;
        }

        // Обновляем overdueMinutes в БД
        await this.orderRepository.update(order.id, {
          overdueMinutes,
        });

        // Отправляем уведомление курьеру
        if (order.currierId) {
          try {
            await this.fcmService.sendToUser(
              order.currierId,
              '⚠️ Просроченный заказ',
              `Заказ #${order.id.slice(-8)} просрочен на ${overdueMinutes} мин`,
              {
                orderId: order.id,
                type: 'order_overdue',
                overdueMinutes: overdueMinutes.toString(),
              },
            );

            this.logger.log(
              `Уведомление отправлено курьеру ${order.currierId} о просроченном заказе ${order.id}`,
            );
          } catch (error) {
            this.logger.error(
              `Ошибка отправки уведомления курьеру: ${error.message}`,
            );
          }
        }

        // Добавляем в список уведомленных
        this.notifiedOrders.add(order.id);
      }

      // Очищаем список уведомленных заказов от завершенных
      this.cleanupNotifiedOrders(overdueOrders);
    } catch (error) {
      this.logger.error(`Ошибка при проверке просроченных заказов: ${error.message}`);
    }
  }

  // Очищаем notifiedOrders от завершенных заказов
  private cleanupNotifiedOrders(currentOverdueOrders: Order[]) {
    const currentOverdueIds = new Set(
      currentOverdueOrders.map((order) => order.id),
    );

    // Удаляем из notifiedOrders те заказы, которых больше нет в списке просроченных
    this.notifiedOrders.forEach((orderId) => {
      if (!currentOverdueIds.has(orderId)) {
        this.notifiedOrders.delete(orderId);
      }
    });
  }

  // Метод для ручного запуска проверки (для тестирования)
  async manualCheck() {
    await this.checkOverdueOrders();
  }
}
