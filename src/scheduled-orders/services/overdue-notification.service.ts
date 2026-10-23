import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, Not, IsNull, In } from 'typeorm';
import { Order, OrderStatus } from '../../order/entities/order.entity';
import { FcmService } from '../../fcm/fcm.service';

/** Насколько заказ должен опоздать, чтобы будить курьера */
const OVERDUE_THRESHOLD_MINUTES = 10;

/**
 * Статусы, в которых заказ ещё можно выполнить. Отменённый или не оплаченный
 * заказ просроченным не считается: курьеру по нему делать нечего.
 */
const ACTIVE_STATUSES = [OrderStatus.ASSIGNED, OrderStatus.IN_PROGRESS];

@Injectable()
export class OverdueNotificationService {
  private readonly logger = new Logger(OverdueNotificationService.name);

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    private fcmService: FcmService,
  ) {}

  // Проверяем каждые 5 минут
  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkOverdueOrders() {
    try {
      const now = new Date();

      const overdueOrders = await this.orderRepository.find({
        where: {
          scheduledAt: LessThan(now),
          status: In(ACTIVE_STATUSES),
          currierId: Not(IsNull()),
          // по заказу уже уведомляли — отметка переживает рестарт процесса
          overdueNotifiedAt: IsNull(),
        },
        relations: ['currier', 'customer'],
      });

      if (overdueOrders.length === 0) {
        return;
      }

      this.logger.log(
        `Найдено ${overdueOrders.length} просроченных заказов без уведомления`,
      );

      for (const order of overdueOrders) {
        if (!order.scheduledAt) {
          continue;
        }

        const overdueMinutes = Math.floor(
          (now.getTime() - new Date(order.scheduledAt).getTime()) / 60000,
        );

        if (overdueMinutes < OVERDUE_THRESHOLD_MINUTES) {
          continue;
        }

        await this.notifyCourier(order, overdueMinutes, now);
      }
    } catch (error) {
      this.logger.error(
        `Ошибка при проверке просроченных заказов: ${error.message}`,
      );
    }
  }

  private async notifyCourier(
    order: Order,
    overdueMinutes: number,
    now: Date,
  ): Promise<void> {
    if (!order.currierId) {
      return;
    }

    try {
      const result = await this.fcmService.sendToUser(
        order.currierId,
        '⚠️ Просроченный заказ',
        `Заказ #${order.id.slice(-8)} просрочен на ${overdueMinutes} мин`,
        {
          orderId: order.id,
          type: 'order_overdue',
          overdueMinutes: overdueMinutes.toString(),
        },
      );

      const courierName = order.currier?.name || order.currierId;

      if (result.success) {
        this.logger.log(
          `[OverdueNotification] ✅ Push ОТПРАВЛЕН: курьер ${courierName}, заказ ${order.id} (просрочен ${overdueMinutes} мин)`,
        );
      } else {
        this.logger.warn(
          `[OverdueNotification] ❌ Push НЕ отправлен: курьер ${courierName}, заказ ${order.id}: ${result.error}`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `[OverdueNotification] Ошибка отправки push курьеру ${order.currierId}: ${error?.message}`,
      );
    }

    // отметку ставим в любом случае: повторять неудачный push каждые 5 минут
    // до бесконечности смысла нет, просрочку видно в админке
    await this.orderRepository.update(order.id, {
      overdueMinutes,
      overdueNotifiedAt: now,
    });
  }

  // Метод для ручного запуска проверки (для тестирования)
  async manualCheck() {
    await this.checkOverdueOrders();
  }
}
