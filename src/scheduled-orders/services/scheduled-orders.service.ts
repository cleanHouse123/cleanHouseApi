import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScheduledOrder, ScheduleFrequency } from '../entities/scheduled-order.entity';
import { Order, OrderStatus } from '../../order/entities/order.entity';
import { Payment, PaymentStatus, PaymentMethod } from '../../order/entities/payment.entity';
import { CreateScheduledOrderDto, UpdateScheduledOrderDto, ScheduledOrderResponseDto } from '../dto/scheduled-order.dto';
import { SubscriptionLimitsService } from '../../subscription/services/subscription-limits.service';
import { SubscriptionService } from '../../subscription/subscription.service';
import { PriceService } from '../../price/price.service';

@Injectable()
export class ScheduledOrdersService {
  private readonly logger = new Logger(ScheduledOrdersService.name);

  constructor(
    @InjectRepository(ScheduledOrder)
    private scheduledOrderRepository: Repository<ScheduledOrder>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    private subscriptionLimitsService: SubscriptionLimitsService,
    private subscriptionService: SubscriptionService,
    private priceService: PriceService,
  ) {}

  /**
   * Создает новое расписание заказов
   * Доступно только для пользователей с активной подпиской
   */
  async createScheduledOrder(dto: CreateScheduledOrderDto, customerId: string): Promise<ScheduledOrderResponseDto> {
    // Проверяем, что у пользователя есть активная подписка
    const activeSubscription = await this.subscriptionService.getUserActiveSubscription(customerId);
    
    if (!activeSubscription) {
      throw new BadRequestException('Заказы по расписанию доступны только для пользователей с активной подпиской');
    }

    // Проверяем лимиты
    const limits = await this.subscriptionLimitsService.checkOrderLimits(customerId);
    
    if (!limits.canCreateOrder) {
      throw new BadRequestException('Превышен лимит заказов для вашей подписки');
    }

    // Создаем расписание
    const scheduledOrder = this.scheduledOrderRepository.create({
      customerId: customerId,
      address: dto.address,
      addressDetails: dto.addressDetails,
      description: dto.description,
      notes: dto.notes,
      frequency: dto.frequency,
      preferredTime: dto.preferredTime,
      daysOfWeek: dto.daysOfWeek,
      startDate: new Date(dto.startDate),
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
    });

    const savedScheduledOrder = await this.scheduledOrderRepository.save(scheduledOrder);
    
    this.logger.log(`Создано расписание заказов для пользователя ${customerId}: ${savedScheduledOrder.id}`);
    
    return this.transformToResponseDto(savedScheduledOrder);
  }

  /**
   * Получает все расписания клиента
   */
  async getCustomerSchedules(customerId: string): Promise<ScheduledOrderResponseDto[]> {
    const schedules = await this.scheduledOrderRepository.find({
      where: { customerId },
      relations: ['customer'],
      order: { createdAt: 'DESC' },
    });

    return schedules.map(schedule => this.transformToResponseDto(schedule));
  }

  /**
   * Получает расписание по ID
   */
  async getScheduleById(id: string): Promise<ScheduledOrderResponseDto> {
    const schedule = await this.scheduledOrderRepository.findOne({
      where: { id },
      relations: ['customer'],
    });

    if (!schedule) {
      throw new NotFoundException('Расписание не найдено');
    }

    return this.transformToResponseDto(schedule);
  }

  /**
   * Обновляет расписание
   */
  async updateSchedule(id: string, dto: UpdateScheduledOrderDto): Promise<ScheduledOrderResponseDto> {
    const schedule = await this.scheduledOrderRepository.findOne({
      where: { id },
    });

    if (!schedule) {
      throw new NotFoundException('Расписание не найдено');
    }

    // Если обновляем даты, конвертируем их
    const updateData: Partial<ScheduledOrder> = {};
    if (dto.address !== undefined) updateData.address = dto.address;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.notes !== undefined) updateData.notes = dto.notes;
    if (dto.frequency !== undefined) updateData.frequency = dto.frequency;
    if (dto.preferredTime !== undefined) updateData.preferredTime = dto.preferredTime;
    if (dto.daysOfWeek !== undefined) updateData.daysOfWeek = dto.daysOfWeek;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.startDate) {
      updateData.startDate = new Date(dto.startDate);
    }
    if (dto.endDate) {
      updateData.endDate = new Date(dto.endDate);
    }

    await this.scheduledOrderRepository.update(id, updateData);
    
    const updatedSchedule = await this.scheduledOrderRepository.findOne({
      where: { id },
      relations: ['customer'],
    });

    if (!updatedSchedule) {
      throw new NotFoundException('Расписание не найдено после обновления');
    }

    return this.transformToResponseDto(updatedSchedule);
  }

  /**
   * Активирует расписание
   */
  async activateSchedule(id: string): Promise<ScheduledOrderResponseDto> {
    return this.updateSchedule(id, { isActive: true });
  }

  /**
   * Деактивирует расписание
   */
  async deactivateSchedule(id: string): Promise<ScheduledOrderResponseDto> {
    return this.updateSchedule(id, { isActive: false });
  }

  /**
   * Удаляет расписание
   */
  async deleteSchedule(id: string): Promise<void> {
    const schedule = await this.scheduledOrderRepository.findOne({
      where: { id },
    });

    if (!schedule) {
      throw new NotFoundException('Расписание не найдено');
    }

    await this.scheduledOrderRepository.remove(schedule);
    this.logger.log(`Удалено расписание ${id}`);
  }

  /**
   * Cron job для автоматического создания заказов по расписанию
   */
  // @Cron(CronExpression.EVERY_30_MINUTES)
  // async handleDailyScheduledOrders() {
  //   try {
  //     await this.processScheduledOrders();
  //     this.logger.log(`[CRON] ${new Date().toISOString()} - Обработка расписаний заказов завершена`);
  //   } catch (error) {
  //     this.logger.error(`[CRON] ${new Date().toISOString()} - Ошибка при обработке расписаний заказов:`, error);
  //   }
  // }

  /**
   * Обрабатывает все активные расписания и создает заказы
   */
  private async processScheduledOrders(): Promise<void> {
    const activeSchedules = await this.scheduledOrderRepository.find({
      where: { isActive: true },
      relations: ['customer'],
    });

    for (const schedule of activeSchedules) {
      try {
        await this.createOrderFromSchedule(schedule);
      } catch (error) {
        this.logger.error(`[CRON] Ошибка при создании заказа из расписания ${schedule.id}:`, error);
      }
    }
  }

  /**
   * Создает заказ из расписания
   */
  private async createOrderFromSchedule(schedule: ScheduledOrder): Promise<void> {
    // Проверяем активную подписку
    const activeSubscription = await this.subscriptionService.getUserActiveSubscription(schedule.customerId);
    
    if (!activeSubscription) {
      this.logger.warn(`Подписка пользователя ${schedule.customerId} истекла, деактивируем расписание ${schedule.id}`);
      schedule.isActive = false;
      await this.scheduledOrderRepository.save(schedule);
      return;
    }

    // Проверяем лимиты подписки
    const limits = await this.subscriptionLimitsService.checkOrderLimits(schedule.customerId);
    
    if (!limits.canCreateOrder) {
      this.logger.warn(`Лимиты пользователя ${schedule.customerId} исчерпаны, деактивируем расписание ${schedule.id}`);
      schedule.isActive = false;
      await this.scheduledOrderRepository.save(schedule);
      return;
    }

    // Проверяем частоту создания заказов
    if (this.shouldCreateOrder(schedule)) {
      const orderPrice = await this.priceService.getOrderPrice(
        schedule.customerId,
      );
      
      // Создаем заказ со статусом PAID
      const order = this.orderRepository.create({
        customerId: schedule.customerId,
        address: schedule.address,
        addressDetails: schedule.addressDetails,
        description: schedule.description,
        notes: schedule.notes,
        price: orderPrice,
        scheduledAt: this.calculateNextOrderTime(schedule),
        status: OrderStatus.PAID, // Сразу оплачен через подписку
        numberPackages: 1, // По умолчанию 1 пакет для автоматических заказов
      });

      const savedOrder = await this.orderRepository.save(order);

      // Создаем автоматический платеж для подписчика
      const payment = this.paymentRepository.create({
        orderId: savedOrder.id,
        amount: 0, // Бесплатно для подписчиков
        status: PaymentStatus.PAID,
        method: PaymentMethod.SUBSCRIPTION,
      });
      await this.paymentRepository.save(payment);
      
      // Обновляем счетчик лимитов
      await this.subscriptionLimitsService.incrementUsedOrders(schedule.customerId);
      
      // Обновляем время последнего создания
      schedule.lastCreatedAt = new Date();
      await this.scheduledOrderRepository.save(schedule);

      this.logger.log(`Создан заказ ${savedOrder.id} из расписания ${schedule.id} для пользователя ${schedule.customerId}`);
    } else {
      this.logger.log(`[CRON] Заказ НЕ создан для расписания ${schedule.id} - не подходит по частоте`);
    }
  }

  /**
   * Определяет, нужно ли создавать заказ на основе частоты расписания
   */
  private shouldCreateOrder(schedule: ScheduledOrder): boolean {
    const now = new Date();
    
    // Проверяем, что расписание уже началось
    if (now < schedule.startDate) {
      return false;
    }

    // Проверяем, что расписание еще не закончилось
    if (schedule.endDate && now > schedule.endDate) {
      return false;
    }

    // Если заказ еще не создавался, создаем
    if (!schedule.lastCreatedAt) {
      return true;
    }

    switch (schedule.frequency) {
      case ScheduleFrequency.DAILY:
        return this.isDifferentDay(schedule.lastCreatedAt, now);
        
      case ScheduleFrequency.EVERY_OTHER_DAY:
        return this.daysDifference(schedule.lastCreatedAt, now) >= 2;
        
      case ScheduleFrequency.WEEKLY:
        return this.daysDifference(schedule.lastCreatedAt, now) >= 7;
        
      case ScheduleFrequency.CUSTOM:
        return this.shouldCreateCustomOrder(schedule, now);
        
      default:
        return false;
    }
  }

  /**
   * Определяет, нужно ли создавать заказ для кастомного расписания
   */
  private shouldCreateCustomOrder(schedule: ScheduledOrder, now: Date): boolean {
    if (!schedule.daysOfWeek || schedule.daysOfWeek.length === 0) {
      return false;
    }

    const currentDayOfWeek = now.getUTCDay(); // 0 = воскресенье, 1 = понедельник (UTC)
    
    // Проверяем, что сегодня подходящий день недели
    if (!schedule.daysOfWeek.includes(currentDayOfWeek)) {
      return false;
    }

    // Проверяем, что с последнего создания прошло достаточно времени
    return schedule.lastCreatedAt ? this.isDifferentDay(schedule.lastCreatedAt, now) : true;
  }

  /**
   * Вычисляет время следующего заказа
   */
  private calculateNextOrderTime(schedule: ScheduledOrder): Date {
    const now = new Date();
    let nextTime = new Date(now);
    
    switch (schedule.frequency) {
      case ScheduleFrequency.DAILY:
        nextTime.setUTCDate(nextTime.getUTCDate() + 1);
        break;
        
      case ScheduleFrequency.EVERY_OTHER_DAY:
        nextTime.setUTCDate(nextTime.getUTCDate() + 2);
        break;
        
      case ScheduleFrequency.WEEKLY:
        nextTime.setUTCDate(nextTime.getUTCDate() + 7);
        break;
        
      case ScheduleFrequency.CUSTOM:
        // Для настраиваемого расписания находим следующий день недели
        if (schedule.daysOfWeek && schedule.daysOfWeek.length > 0) {
          nextTime = this.getNextCustomDay(now, schedule.daysOfWeek);
        } else {
          nextTime.setUTCDate(nextTime.getUTCDate() + 1);
        }
        break;
        
      default:
        nextTime.setUTCDate(nextTime.getUTCDate() + 1);
    }
    
    // Устанавливаем предпочтительное время, если указано
    if (schedule.preferredTime) {
      const [hours, minutes] = schedule.preferredTime.split(':').map(Number);
      nextTime.setUTCHours(hours, minutes, 0, 0);
    } else {
      // Если время не указано, планируем в 10:00
      nextTime.setUTCHours(10, 0, 0, 0);
    }
    
    return nextTime;
  }

  /**
   * Находит следующий день недели из списка дней
   */
  private getNextCustomDay(now: Date, daysOfWeek: number[]): Date {
    const currentDay = now.getUTCDay(); // 0 = воскресенье, 1 = понедельник, ..., 6 = суббота (UTC)
    const sortedDays = [...daysOfWeek].sort((a, b) => a - b);
    
    // Ищем следующий день в текущей неделе
    for (const day of sortedDays) {
      if (day > currentDay) {
        const nextDate = new Date(now);
        nextDate.setUTCDate(now.getUTCDate() + (day - currentDay));
        return nextDate;
      }
    }
    
    // Если не нашли в текущей неделе, берем первый день следующей недели
    const firstDayNextWeek = new Date(now);
    firstDayNextWeek.setUTCDate(now.getUTCDate() + (7 - currentDay + sortedDays[0]));
    return firstDayNextWeek;
  }

  /**
   * Проверяет, что две даты относятся к разным дням
   */
  private isDifferentDay(date1: Date, date2: Date): boolean {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    
    d1.setUTCHours(0, 0, 0, 0);
    d2.setUTCHours(0, 0, 0, 0);
    
    return d1.getTime() !== d2.getTime();
  }

  /**
   * Вычисляет разность в днях между двумя датами
   */
  private daysDifference(date1: Date, date2: Date): number {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    
    d1.setUTCHours(0, 0, 0, 0);
    d2.setUTCHours(0, 0, 0, 0);
    
    const diffTime = d2.getTime() - d1.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Преобразует сущность в DTO для ответа
   */
  private transformToResponseDto(schedule: ScheduledOrder): ScheduledOrderResponseDto {
    const dto = {
      id: schedule.id,
      customerId: schedule.customerId,
      customer: schedule.customer || null,
      address: schedule.address,
      addressDetails: schedule.addressDetails,
      description: schedule.description,
      notes: schedule.notes,
      frequency: schedule.frequency,
      preferredTime: schedule.preferredTime,
      daysOfWeek: schedule.daysOfWeek,
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      isActive: schedule.isActive,
      lastCreatedAt: schedule.lastCreatedAt,
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
    };
    return dto;
  }
}
