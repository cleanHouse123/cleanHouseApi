import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { Order, OrderStatus } from './entities/order.entity';
import {
  Payment,
  PaymentStatus,
  PaymentMethod,
} from './entities/payment.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { User } from '../user/entities/user.entity';
import { UserRole } from '../shared/types/user.role';
import { SubscriptionService } from '../subscription/subscription.service';
import { OrderPaymentService } from './services/order-payment.service';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private subscriptionService: SubscriptionService,
    private orderPaymentService: OrderPaymentService,
  ) {}

  async create(createOrderDto: CreateOrderDto): Promise<OrderResponseDto> {
    // Проверяем существование клиента
    const customer = await this.userRepository.findOne({
      where: { id: createOrderDto.customerId },
    });

    if (!customer) {
      throw new NotFoundException('Клиент не найден');
    }

    // Проверяем активную подписку пользователя
    const activeSubscription =
      await this.subscriptionService.getUserActiveSubscription(
        createOrderDto.customerId,
      );

    // Определяем статус заказа и способ оплаты
    let orderStatus = OrderStatus.NEW;
    let paymentMethod = createOrderDto.paymentMethod;

    // Если указан способ оплаты "subscription" или есть активная подписка
    if (
      createOrderDto.paymentMethod === PaymentMethod.SUBSCRIPTION ||
      activeSubscription
    ) {
      if (!activeSubscription) {
        throw new BadRequestException(
          'У вас нет активной подписки для оплаты через подписку',
        );
      }
      orderStatus = OrderStatus.PAID; // Заказ сразу оплачен
      paymentMethod = PaymentMethod.SUBSCRIPTION;
    } else if (!createOrderDto.paymentMethod) {
      throw new BadRequestException(
        'Необходимо указать способ оплаты или иметь активную подписку',
      );
    }

    // Создаем заказ
    const order = this.orderRepository.create({
      customerId: createOrderDto.customerId,
      address: createOrderDto.address,
      description: createOrderDto.description,
      price: 149, // Фиксированная цена
      notes: createOrderDto.notes,
      scheduledAt: createOrderDto.scheduledAt
        ? new Date(createOrderDto.scheduledAt)
        : undefined,
      status: orderStatus,
    });

    const savedOrder = await this.orderRepository.save(order);

    // Если заказ оплачен через подписку, создаем автоматический платеж
    if (
      orderStatus === OrderStatus.PAID &&
      paymentMethod === PaymentMethod.SUBSCRIPTION
    ) {
      const payment = this.paymentRepository.create({
        orderId: savedOrder.id,
        amount: 0, // Бесплатно для подписчиков
        status: PaymentStatus.PAID,
        method: PaymentMethod.SUBSCRIPTION,
      });
      await this.paymentRepository.save(payment);
    } else if (orderStatus === OrderStatus.NEW) {
      // Для новых заказов создаем ссылку на оплату
      try {
        const paymentData = await this.orderPaymentService.createPaymentLink(
          savedOrder.id,
          savedOrder.price * 100, // Конвертируем в копейки
        );

        // Обновляем заказ с ссылкой на оплату
        savedOrder.paymentUrl = paymentData.paymentUrl;
        await this.orderRepository.save(savedOrder);
      } catch (error) {
        console.error('Ошибка создания ссылки на оплату:', error);
        // Не блокируем создание заказа из-за ошибки платежа
      }
    }

    return this.findOne(savedOrder.id);
  }

  // Метод для создания ссылок на оплату для существующих заказов
  async createPaymentUrlForOrder(orderId: string): Promise<string | null> {
    try {
      const order = await this.orderRepository.findOne({
        where: { id: orderId },
      });

      if (!order || order.status !== OrderStatus.NEW) {
        return null;
      }

      const paymentData = await this.orderPaymentService.createPaymentLink(
        orderId,
        order.price * 100, // Конвертируем в копейки
      );

      // Обновляем заказ с ссылкой на оплату
      order.paymentUrl = paymentData.paymentUrl;
      await this.orderRepository.save(order);

      return paymentData.paymentUrl;
    } catch (error) {
      console.error('Ошибка создания ссылки на оплату для заказа:', error);
      return null;
    }
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    status?: OrderStatus,
    customerId?: string,
    currierId?: string,
  ): Promise<{ orders: OrderResponseDto[]; total: number }> {
    const where: FindOptionsWhere<Order> = {};

    if (status) {
      where.status = status;
    }

    if (customerId) {
      where.customerId = customerId;
    }

    if (currierId) {
      where.currierId = currierId;
    }

    const [orders, total] = await this.orderRepository.findAndCount({
      where,
      relations: ['customer', 'currier', 'payments'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      orders: orders.map((order) => this.transformToResponseDto(order)),
      total,
    };
  }

  async findOne(id: string): Promise<OrderResponseDto> {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: ['customer', 'currier', 'payments'],
    });

    if (!order) {
      throw new NotFoundException('Заказ не найден');
    }

    return this.transformToResponseDto(order);
  }

  async updateStatus(
    id: string,
    updateOrderStatusDto: UpdateOrderStatusDto,
  ): Promise<OrderResponseDto> {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: ['customer', 'currier'],
    });

    if (!order) {
      throw new NotFoundException('Заказ не найден');
    }

    // Проверяем валидность перехода статуса
    this.validateStatusTransition(order.status, updateOrderStatusDto.status);

    // Если назначаем курьера, проверяем его существование и роль
    if (updateOrderStatusDto.status === OrderStatus.ASSIGNED) {
      if (!updateOrderStatusDto.currierId) {
        throw new BadRequestException(
          'Необходимо указать ID курьера для назначения заказа',
        );
      }

      const currier = await this.userRepository.findOne({
        where: { id: updateOrderStatusDto.currierId },
      });

      if (!currier) {
        throw new NotFoundException('Курьер не найден');
      }

      if (currier.role !== UserRole.CURRIER) {
        throw new BadRequestException('Пользователь не является курьером');
      }

      order.currierId = updateOrderStatusDto.currierId;
    }

    order.status = updateOrderStatusDto.status;

    await this.orderRepository.save(order);

    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const order = await this.orderRepository.findOne({ where: { id } });

    if (!order) {
      throw new NotFoundException('Заказ не найден');
    }

    // Проверяем, можно ли удалить заказ
    if (
      order.status === OrderStatus.IN_PROGRESS ||
      order.status === OrderStatus.DONE
    ) {
      throw new BadRequestException(
        'Нельзя удалить заказ в процессе выполнения или завершенный',
      );
    }

    await this.orderRepository.remove(order);
  }

  async getOrdersByCustomer(customerId: string): Promise<OrderResponseDto[]> {
    const orders = await this.orderRepository.find({
      where: { customerId },
      relations: ['customer', 'currier', 'payments'],
      order: { createdAt: 'DESC' },
    });

    return orders.map((order) => this.transformToResponseDto(order));
  }

  async getOrdersByCurrier(currierId: string): Promise<OrderResponseDto[]> {
    const orders = await this.orderRepository.find({
      where: { currierId },
      relations: ['customer', 'currier', 'payments'],
      order: { createdAt: 'DESC' },
    });

    return orders.map((order) => this.transformToResponseDto(order));
  }

  private validateStatusTransition(
    currentStatus: OrderStatus,
    newStatus: OrderStatus,
  ): void {
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.NEW]: [
        OrderStatus.PAID,
        OrderStatus.ASSIGNED,
        OrderStatus.CANCELED,
      ],
      [OrderStatus.PAID]: [OrderStatus.ASSIGNED, OrderStatus.CANCELED],
      [OrderStatus.ASSIGNED]: [OrderStatus.IN_PROGRESS, OrderStatus.CANCELED],
      [OrderStatus.IN_PROGRESS]: [OrderStatus.DONE, OrderStatus.CANCELED],
      [OrderStatus.DONE]: [],
      [OrderStatus.CANCELED]: [],
    };

    if (!validTransitions[currentStatus].includes(newStatus)) {
      throw new BadRequestException(
        `Невозможно изменить статус с ${currentStatus} на ${newStatus}`,
      );
    }
  }

  private transformToResponseDto(order: Order): OrderResponseDto {
    return {
      id: order.id,
      customer: order.customer,
      currier: order.currier,
      address: order.address,
      description: order.description,
      price: order.price,
      status: order.status,
      scheduledAt: order.scheduledAt,
      notes: order.notes,
      payments: order.payments || [],
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  // ==================== COURIER METHODS ====================

  async takeOrder(
    orderId: string,
    courierId: string,
  ): Promise<OrderResponseDto> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['customer', 'currier'],
    });

    if (!order) {
      throw new NotFoundException('Заказ не найден');
    }

    if (order.status !== OrderStatus.NEW) {
      throw new BadRequestException('Заказ уже взят или недоступен');
    }

    // Проверяем, что курьер существует и имеет правильную роль
    const courier = await this.userRepository.findOne({
      where: { id: courierId },
    });

    if (!courier) {
      throw new NotFoundException('Курьер не найден');
    }

    if (courier.role !== UserRole.CURRIER) {
      throw new BadRequestException('Пользователь не является курьером');
    }

    // Назначаем курьера и меняем статус
    order.currierId = courierId;
    order.status = OrderStatus.ASSIGNED;

    await this.orderRepository.save(order);

    return this.findOne(orderId);
  }

  async startOrder(
    orderId: string,
    courierId: string,
  ): Promise<OrderResponseDto> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['customer', 'currier'],
    });

    if (!order) {
      throw new NotFoundException('Заказ не найден');
    }

    if (order.currierId !== courierId) {
      throw new BadRequestException('Заказ назначен другому курьеру');
    }

    if (order.status !== OrderStatus.ASSIGNED) {
      throw new BadRequestException('Заказ не может быть начат');
    }

    order.status = OrderStatus.IN_PROGRESS;
    await this.orderRepository.save(order);

    return this.findOne(orderId);
  }

  async completeOrder(
    orderId: string,
    courierId: string,
  ): Promise<OrderResponseDto> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['customer', 'currier'],
    });

    if (!order) {
      throw new NotFoundException('Заказ не найден');
    }

    if (order.currierId !== courierId) {
      throw new BadRequestException('Заказ назначен другому курьеру');
    }

    if (order.status !== OrderStatus.IN_PROGRESS) {
      throw new BadRequestException('Заказ не может быть завершен');
    }

    order.status = OrderStatus.DONE;
    await this.orderRepository.save(order);

    return this.findOne(orderId);
  }

  async cancelOrder(
    orderId: string,
    courierId: string,
    reason?: string,
  ): Promise<OrderResponseDto> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['customer', 'currier'],
    });

    if (!order) {
      throw new NotFoundException('Заказ не найден');
    }

    if (order.currierId !== courierId) {
      throw new BadRequestException('Заказ назначен другому курьеру');
    }

    if (order.status === OrderStatus.DONE) {
      throw new BadRequestException('Завершенный заказ не может быть отменен');
    }

    order.status = OrderStatus.CANCELED;
    await this.orderRepository.save(order);

    return this.findOne(orderId);
  }

  async updatePaymentStatus(
    paymentId: string,
    status: PaymentStatus,
  ): Promise<void> {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException('Платеж не найден');
    }

    payment.status = status;
    await this.paymentRepository.save(payment);
  }
}
