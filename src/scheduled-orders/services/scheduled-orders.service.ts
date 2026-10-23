import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScheduledOrder } from '../entities/scheduled-order.entity';
import { UserAddress } from '../../address/entities/user-address';
import {
  CreateScheduledOrderDto,
  UpdateScheduledOrderDto,
  ScheduledOrderResponseDto,
} from '../dto/scheduled-order.dto';
import { SubscriptionLimitsService } from '../../subscription/services/subscription-limits.service';
import { SubscriptionService } from '../../subscription/subscription.service';
import { OrderService } from '../../order/order.service';
import { PaymentMethod } from '../../order/entities/payment.entity';
import { findDueOccurrence } from './schedule-occurrence';

/** Заказ по подписке всегда на 2 пакета — так же, как при ручном оформлении */
const PACKAGES_PER_ORDER = 2;

@Injectable()
export class ScheduledOrdersService {
  private readonly logger = new Logger(ScheduledOrdersService.name);

  constructor(
    @InjectRepository(ScheduledOrder)
    private scheduledOrderRepository: Repository<ScheduledOrder>,
    @InjectRepository(UserAddress)
    private userAddressRepository: Repository<UserAddress>,
    private subscriptionLimitsService: SubscriptionLimitsService,
    private subscriptionService: SubscriptionService,
    private orderService: OrderService,
  ) {}

  /**
   * Создает новое расписание заказов
   * Доступно только для пользователей с активной подпиской
   */
  async createScheduledOrder(
    dto: CreateScheduledOrderDto,
    customerId: string,
  ): Promise<ScheduledOrderResponseDto> {
    await this.assertCanSchedule(customerId);
    await this.assertOwnAddress(dto.addressId, customerId);

    const startDate = new Date(dto.startDate);

    const scheduledOrder = this.scheduledOrderRepository.create({
      customerId: customerId,
      address: dto.address,
      addressId: dto.addressId,
      addressDetails: dto.addressDetails,
      description: dto.description,
      notes: dto.notes,
      frequency: dto.frequency,
      preferredTime: dto.preferredTime,
      daysOfWeek: dto.daysOfWeek,
      startDate,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      // вынос на startDate уже оформлен вручную — иначе крон создал бы
      // на него второй такой же заказ
      lastCreatedAt: dto.firstPickupAlreadyOrdered ? startDate : undefined,
    });

    const savedScheduledOrder =
      await this.scheduledOrderRepository.save(scheduledOrder);

    this.logger.log(
      `Создано расписание заказов для пользователя ${customerId}: ${savedScheduledOrder.id}`,
    );

    return this.transformToResponseDto(savedScheduledOrder);
  }

  /**
   * Получает все расписания клиента
   */
  async getCustomerSchedules(
    customerId: string,
  ): Promise<ScheduledOrderResponseDto[]> {
    const schedules = await this.scheduledOrderRepository.find({
      where: { customerId },
      relations: ['customer'],
      order: { createdAt: 'DESC' },
    });

    return schedules.map((schedule) => this.transformToResponseDto(schedule));
  }

  /**
   * Получает расписание по ID
   */
  async getScheduleById(
    id: string,
    customerId: string,
  ): Promise<ScheduledOrderResponseDto> {
    const schedule = await this.findOwnSchedule(id, customerId);

    return this.transformToResponseDto(schedule);
  }

  /**
   * Обновляет расписание
   */
  async updateSchedule(
    id: string,
    dto: UpdateScheduledOrderDto,
    customerId: string,
  ): Promise<ScheduledOrderResponseDto> {
    const schedule = await this.findOwnSchedule(id, customerId);

    if (dto.address !== undefined) schedule.address = dto.address;
    if (dto.description !== undefined) schedule.description = dto.description;
    if (dto.notes !== undefined) schedule.notes = dto.notes;
    if (dto.frequency !== undefined) schedule.frequency = dto.frequency;
    if (dto.preferredTime !== undefined)
      schedule.preferredTime = dto.preferredTime;
    if (dto.daysOfWeek !== undefined) schedule.daysOfWeek = dto.daysOfWeek;
    if (dto.isActive !== undefined) schedule.isActive = dto.isActive;
    if (dto.startDate) {
      schedule.startDate = new Date(dto.startDate);
    }
    // пустое значение снимает дату окончания: расписание снова бессрочное
    if (dto.endDate !== undefined) {
      schedule.endDate = dto.endDate ? new Date(dto.endDate) : undefined;
    }

    const updated = await this.scheduledOrderRepository.save(schedule);

    return this.transformToResponseDto(updated);
  }

  /**
   * Активирует расписание.
   *
   * Подписка проверяется заново: за время паузы она могла закончиться, а
   * выключенное расписание — единственное, что мешало создавать заказы.
   */
  async activateSchedule(
    id: string,
    customerId: string,
  ): Promise<ScheduledOrderResponseDto> {
    await this.assertCanSchedule(customerId);

    return this.updateSchedule(id, { isActive: true }, customerId);
  }

  /**
   * Деактивирует расписание
   */
  async deactivateSchedule(
    id: string,
    customerId: string,
  ): Promise<ScheduledOrderResponseDto> {
    return this.updateSchedule(id, { isActive: false }, customerId);
  }

  /**
   * Удаляет расписание
   */
  async deleteSchedule(id: string, customerId: string): Promise<void> {
    const schedule = await this.findOwnSchedule(id, customerId);

    await this.scheduledOrderRepository.remove(schedule);
    this.logger.log(`Удалено расписание ${id}`);
  }

  /**
   * Cron job для автоматического создания заказов по расписанию.
   *
   * Раз в полчаса: заказ создаётся в начале тех суток, на которые назначен
   * вынос, поэтому попасть в выбранное время с точностью до минуты не нужно.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleScheduledOrders(): Promise<void> {
    try {
      await this.processScheduledOrders();
    } catch (error) {
      this.logger.error('[CRON] Ошибка при обработке расписаний:', error);
    }
  }

  /**
   * Обрабатывает все активные расписания и создает заказы
   */
  async processScheduledOrders(): Promise<void> {
    const activeSchedules = await this.scheduledOrderRepository.find({
      where: { isActive: true },
    });

    for (const schedule of activeSchedules) {
      try {
        await this.createOrderFromSchedule(schedule);
      } catch (error) {
        this.logger.error(
          `[CRON] Ошибка при создании заказа из расписания ${schedule.id}:`,
          error,
        );
      }
    }
  }

  /**
   * Создает заказ из расписания
   */
  private async createOrderFromSchedule(
    schedule: ScheduledOrder,
  ): Promise<void> {
    const dueAt = findDueOccurrence(schedule, new Date());

    if (!dueAt) {
      return;
    }

    const activeSubscription =
      await this.subscriptionService.getUserActiveSubscription(
        schedule.customerId,
      );

    if (!activeSubscription) {
      this.logger.warn(
        `Подписка пользователя ${schedule.customerId} истекла, деактивируем расписание ${schedule.id}`,
      );
      schedule.isActive = false;
      await this.scheduledOrderRepository.save(schedule);
      return;
    }

    const limits = await this.subscriptionLimitsService.checkOrderLimits(
      schedule.customerId,
      PACKAGES_PER_ORDER,
    );

    if (!limits.canCreateOrder) {
      this.logger.warn(
        `Лимиты пользователя ${schedule.customerId} исчерпаны, деактивируем расписание ${schedule.id}`,
      );
      schedule.isActive = false;
      await this.scheduledOrderRepository.save(schedule);
      return;
    }

    // Заказ создаётся тем же путём, что и вручную: со списанием лимита,
    // платежом по подписке, привязкой к адресу и уведомлением курьерам
    const order = await this.orderService.create({
      customerId: schedule.customerId,
      address: schedule.address,
      addressId: schedule.addressId,
      addressDetails: schedule.addressDetails,
      description: schedule.description,
      notes: schedule.notes,
      paymentMethod: PaymentMethod.SUBSCRIPTION,
      numberPackages: PACKAGES_PER_ORDER,
      scheduledAt: dueAt.toISOString(),
    });

    // запоминаем сам вынос, а не момент создания: по нему считается следующий
    schedule.lastCreatedAt = dueAt;
    await this.scheduledOrderRepository.save(schedule);

    this.logger.log(
      `Создан заказ ${order.id} из расписания ${schedule.id} на ${dueAt.toISOString()}`,
    );
  }

  /** Расписание клиента или отказ: чужие расписания недоступны */
  private async findOwnSchedule(
    id: string,
    customerId: string,
  ): Promise<ScheduledOrder> {
    const schedule = await this.scheduledOrderRepository.findOne({
      where: { id },
      relations: ['customer'],
    });

    if (!schedule) {
      throw new NotFoundException('Расписание не найдено');
    }

    if (schedule.customerId !== customerId) {
      throw new ForbiddenException('Это расписание принадлежит другому клиенту');
    }

    return schedule;
  }

  /** Адрес из справочника клиента — чужой брать нельзя */
  private async assertOwnAddress(
    addressId: string | undefined,
    customerId: string,
  ): Promise<void> {
    if (!addressId) {
      return;
    }

    const address = await this.userAddressRepository.findOne({
      where: { id: addressId, userId: customerId },
    });

    if (!address) {
      throw new BadRequestException(
        'Адрес не найден или не принадлежит данному пользователю',
      );
    }
  }

  /** Расписания доступны только подписчикам, у которых остался лимит */
  private async assertCanSchedule(customerId: string): Promise<void> {
    const activeSubscription =
      await this.subscriptionService.getUserActiveSubscription(customerId);

    if (!activeSubscription) {
      throw new BadRequestException(
        'Заказы по расписанию доступны только для пользователей с активной подпиской',
      );
    }

    const limits = await this.subscriptionLimitsService.checkOrderLimits(
      customerId,
      PACKAGES_PER_ORDER,
    );

    if (!limits.canCreateOrder) {
      throw new BadRequestException('Превышен лимит заказов для вашей подписки');
    }
  }

  /**
   * Преобразует сущность в DTO для ответа
   */
  private transformToResponseDto(
    schedule: ScheduledOrder,
  ): ScheduledOrderResponseDto {
    return {
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
  }
}
