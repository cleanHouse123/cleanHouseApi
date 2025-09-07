import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { Order, OrderStatus } from './entities/order.entity';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { User } from '../user/entities/user.entity';
import { UserRole } from '../shared/types/user.role';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async create(createOrderDto: CreateOrderDto): Promise<OrderResponseDto> {
    // Проверяем существование клиента
    const customer = await this.userRepository.findOne({
      where: { id: createOrderDto.customerId },
    });

    if (!customer) {
      throw new NotFoundException('Клиент не найден');
    }

    // Создаем заказ
    const order = this.orderRepository.create({
      customerId: createOrderDto.customerId,
      address: createOrderDto.address,
      description: createOrderDto.description,
      price: createOrderDto.price,
      notes: createOrderDto.notes,
      scheduledAt: createOrderDto.scheduledAt
        ? new Date(createOrderDto.scheduledAt)
        : undefined,
      status: OrderStatus.NEW,
    });

    const savedOrder = await this.orderRepository.save(order);

    // Создаем платеж (замокаем)
    const payment = this.paymentRepository.create({
      orderId: savedOrder.id,
      amount: createOrderDto.price,
      status: PaymentStatus.PENDING,
      method: createOrderDto.paymentMethod,
    });

    await this.paymentRepository.save(payment);

    return this.findOne(savedOrder.id);
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
      [OrderStatus.NEW]: [OrderStatus.ASSIGNED, OrderStatus.CANCELED],
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
}
