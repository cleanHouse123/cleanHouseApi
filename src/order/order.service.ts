import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  FindOptionsWhere,
  DataSource,
  In,
  IsNull,
  Not,
} from 'typeorm';
import { Order, OrderStatus } from './entities/order.entity';
import {
  Payment,
  PaymentStatus,
  PaymentMethod,
} from './entities/payment.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { FindNearbyOrdersDto } from './dto/find-nearby-orders.dto';
import { FindOrdersQueryDto, SortOrder } from './dto/find-orders-query.dto';
import { DEFAULT_PAGE, DEFAULT_LIMIT } from '../shared/constants';
import { User } from '../user/entities/user.entity';
import { UserRole } from '../shared/types/user.role';
import { SubscriptionService } from '../subscription/subscription.service';
import { SubscriptionLimitsService } from '../subscription/services/subscription-limits.service';
import { OrderPaymentService } from './services/order-payment.service';
import { PriceService } from '../price/price.service';
import { FcmService } from '../fcm/fcm.service';

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
    private subscriptionLimitsService: SubscriptionLimitsService,
    private orderPaymentService: OrderPaymentService,
    private priceService: PriceService,
    private fcmService: FcmService,
    private dataSource: DataSource,
  ) {}

  async create(createOrderDto: CreateOrderDto): Promise<OrderResponseDto> {
    // Проверяем существование клиента
    const customer = await this.userRepository.findOne({
      where: { id: createOrderDto.customerId },
    });

    if (!customer) {
      throw new NotFoundException('Клиент не найден');
    }

    const numberPackages = createOrderDto.numberPackages || 1;

    // Проверяем лимиты заказов для пользователя с учетом количества пакетов
    const limits = await this.subscriptionLimitsService.checkOrderLimits(
      createOrderDto.customerId,
      numberPackages,
    );

    if (
      !limits.canCreateOrder &&
      createOrderDto?.paymentMethod === PaymentMethod.SUBSCRIPTION
    ) {
      const reason = limits.isExpired
        ? `Подписка завершена по причине: ${limits.expiryReason === 'time' ? 'истечение времени' : 'исчерпание лимитов'}`
        : 'Превышен лимит заказов для вашей подписки';

      throw new BadRequestException(
        `${reason}. Доступно: ${limits.remainingOrders} заказов из ${limits.totalLimit}, требуется: ${numberPackages}`,
      );
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

    const baseOrderPrice = await this.priceService.getOrderPrice(
      createOrderDto.customerId,
    );

    // Если это первый заказ (скидка), скидка применяется только к первому пакету
    // Остальные пакеты по полной цене (149 руб)
    const isFirstOrder = baseOrderPrice === 100; // 100 копеек = первый заказ
    const fullPrice = 14900; // 149 рублей в копейках

    let orderPrice: number;
    if (isFirstOrder && numberPackages > 1) {
      // Первый пакет со скидкой (1 руб) + остальные по полной цене
      orderPrice = baseOrderPrice + (numberPackages - 1) * fullPrice;
    } else {
      // Обычный расчет: цена * количество пакетов
      orderPrice = baseOrderPrice * numberPackages;
    }

    // Преобразуем координаты из фронта в нужный формат
    let coordinates: { lat: number; lon: number } | undefined;
    if (
      createOrderDto.coordinates?.geo_lat &&
      createOrderDto.coordinates?.geo_lon
    ) {
      coordinates = {
        lat: parseFloat(createOrderDto.coordinates.geo_lat),
        lon: parseFloat(createOrderDto.coordinates.geo_lon),
      };
    }

    console.log('=== ORDER CREATION DEBUG ===');
    console.log(
      'Input addressDetails:',
      JSON.stringify(createOrderDto.addressDetails, null, 2),
    );

    const order = this.orderRepository.create({
      customerId: createOrderDto.customerId,
      address: createOrderDto.address,
      addressDetails: createOrderDto.addressDetails,
      description: createOrderDto.description,
      price: orderPrice,
      notes: createOrderDto.notes,
      scheduledAt: createOrderDto.scheduledAt,
      status: orderStatus,
      coordinates,
      numberPackages,
    });

    const savedOrder = await this.orderRepository.save(order);

    console.log(
      'Saved order addressDetails:',
      JSON.stringify(savedOrder.addressDetails, null, 2),
    );
    console.log('=== END DEBUG ===');

    // Обновляем счетчик использованных заказов в подписке с учетом количества пакетов
    await this.subscriptionLimitsService.incrementUsedOrders(
      createOrderDto.customerId,
      numberPackages,
    );

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

      // Отправляем push-уведомления курьерам о новом оплаченном заказе
      await this.notifyCouriersAboutPaidOrder(savedOrder);
    } else if (orderStatus === OrderStatus.NEW) {
      // Для новых заказов создаем ссылку на оплату
      try {
        // Получаем пользователя с email
        const customer = await this.userRepository.findOne({
          where: { id: savedOrder.customerId },
        });

        const paymentData = await this.orderPaymentService.createPaymentLink(
          savedOrder.id,
          savedOrder.price, // Цена уже в копейках
          customer?.email, // Передаем email если есть, иначе undefined
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
        relations: ['customer'],
      });

      if (!order || order.status !== OrderStatus.NEW) {
        return null;
      }

      const paymentData = await this.orderPaymentService.createPaymentLink(
        orderId,
        order.price, // Цена уже в копейках
        order.customer?.email, // Передаем email если есть, иначе undefined
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
    query: FindOrdersQueryDto,
  ): Promise<{ orders: OrderResponseDto[]; total: number }> {
    const {
      page = DEFAULT_PAGE,
      limit = DEFAULT_LIMIT,
      status,
      customerId,
      currierId,
      startScheduledAtDate,
      endScheduledAtDate,
      sortOrder = SortOrder.ASC,
    } = query;

    const queryBuilder = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.currier', 'currier')
      .leftJoinAndSelect('order.payments', 'payments');

    if (status) {
      queryBuilder.andWhere('order.status = :status', { status });
    }

    if (customerId) {
      queryBuilder.andWhere('order.customerId = :customerId', { customerId });
    }

    if (currierId) {
      queryBuilder.andWhere('order.currierId = :currierId', { currierId });
    }

    if (startScheduledAtDate) {
      queryBuilder.andWhere('order.scheduledAt >= :startScheduledAtDate', {
        startScheduledAtDate,
      });
    }

    if (endScheduledAtDate) {
      queryBuilder.andWhere('order.scheduledAt <= :endScheduledAtDate', {
        endScheduledAtDate,
      });
    }

    // Сортировка по дате создания от новых к старым
    queryBuilder.orderBy('order.createdAt', 'DESC');

    // Пагинация
    queryBuilder.skip((page - 1) * limit).take(limit);

    const [orders, total] = await queryBuilder.getManyAndCount();

    return {
      orders: orders.map((order) => this.transformToResponseDto(order)),
      total,
    };
  }

  async findAllNearby(findNearbyOrdersDto: FindNearbyOrdersDto): Promise<{
    orders: (OrderResponseDto & { distance: number })[];
    total: number;
  }> {
    const {
      lat,
      lon,
      page = 1,
      limit = 10,
      status,
      currierId,
    } = findNearbyOrdersDto;

    // Строим SQL запрос с использованием PostGIS и параметризованных запросов
    // Вычисляем расстояние для всех заказов, но не фильтруем по maxDistance
    let query = `
      SELECT 
        o.*,
        ST_Distance(
          ST_SetSRID(ST_MakePoint((o.coordinates->>'lon')::float, (o.coordinates->>'lat')::float), 4326)::geography,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        ) as distance
      FROM "order" o
      WHERE o.coordinates IS NOT NULL
        AND o.coordinates->>'lat' IS NOT NULL
        AND o.coordinates->>'lon' IS NOT NULL
    `;

    const params: any[] = [lon, lat];

    // Добавляем фильтр по статусу, если указан
    if (status) {
      query += ` AND o.status = $${params.length + 1}`;
      params.push(status);
    }

    // Добавляем фильтр по currierId, если указан
    if (currierId) {
      query += ` AND o."currierId" = $${params.length + 1}`;
      params.push(currierId);
    }

    // Добавляем сортировку по расстоянию и пагинацию
    const limitParam = params.length + 1;
    const offsetParam = params.length + 2;
    query += `
      ORDER BY distance ASC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;
    params.push(limit, (page - 1) * limit);

    // Выполняем запрос
    const rawOrders = await this.dataSource.query(query, params);

    // Получаем общее количество для пагинации
    let countQuery = `
      SELECT COUNT(*) as total
      FROM "order" o
      WHERE o.coordinates IS NOT NULL
        AND o.coordinates->>'lat' IS NOT NULL
        AND o.coordinates->>'lon' IS NOT NULL
    `;
    const countParams: any[] = [];

    if (status) {
      countQuery += ` AND o.status = $${countParams.length + 1}`;
      countParams.push(status);
    }

    if (currierId) {
      countQuery += ` AND o."currierId" = $${countParams.length + 1}`;
      countParams.push(currierId);
    }

    const countResult = await this.dataSource.query(countQuery, countParams);
    const total = parseInt(countResult[0]?.total || '0', 10);

    // Получаем полные данные заказов с отношениями
    const orderIds = rawOrders.map((row: any) => row.id);

    if (orderIds.length === 0) {
      return {
        orders: [],
        total: 0,
      };
    }

    const orders = await this.orderRepository.find({
      where: { id: In(orderIds) },
      relations: ['customer', 'currier', 'payments'],
    });

    // Создаем мапу для быстрого доступа к расстояниям
    const distanceMap = new Map(
      rawOrders.map((row: any) => [row.id, parseFloat(row.distance)]),
    );

    // Сортируем заказы по расстоянию, затем по дате создания (от новых к старым)
    // Сначала сортируем исходные заказы
    orders.sort((a, b) => {
      const distanceA = distanceMap.get(a.id);
      const distanceB = distanceMap.get(b.id);
      const numDistanceA = typeof distanceA === 'number' ? distanceA : 0;
      const numDistanceB = typeof distanceB === 'number' ? distanceB : 0;
      // Сначала по расстоянию
      if (numDistanceA !== numDistanceB) {
        return numDistanceA - numDistanceB;
      }
      // Если расстояния равны, сортируем по дате создания (от новых к старым)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Затем преобразуем в DTO и добавляем distance
    const ordersWithDistance: (OrderResponseDto & { distance: number })[] =
      orders.map((order) => {
        const distance = distanceMap.get(order.id);
        return {
          ...this.transformToResponseDto(order),
          distance: typeof distance === 'number' ? distance : 0,
        };
      });

    return {
      orders: ordersWithDistance,
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

    // Если заказ отменен, уменьшаем счетчик использованных заказов
    // if (updateOrderStatusDto.status === OrderStatus.CANCELED) {
    //   await this.subscriptionLimitsService.decrementUsedOrders(order.customerId);
    // }

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
      [OrderStatus.ASSIGNED]: [
        OrderStatus.IN_PROGRESS,
        OrderStatus.CANCELED,
        OrderStatus.ASSIGNED,
      ],
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
      id: order?.id || '',
      customer: order?.customer || null,
      currier: order?.currier || null,
      address: order?.address || '',
      addressDetails: order?.addressDetails || undefined,
      description: order?.description || '',
      price: order?.price || 0,
      status: order?.status || null,
      scheduledAt: order?.scheduledAt || null,
      notes: order?.notes || '',
      paymentUrl: order?.paymentUrl || undefined,
      coordinates: order?.coordinates || undefined,
      numberPackages: order?.numberPackages || 1,
      payments: order?.payments || [],
      createdAt: order?.createdAt || new Date(),
      updatedAt: order?.updatedAt || new Date(),
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

  /**
   * Отправляет push-уведомления всем курьерам о том, что заказ оплачен и готов к работе
   */
  private async notifyCouriersAboutPaidOrder(order: Order): Promise<void> {
    try {
      const couriers = await this.userRepository.find({
        where: {
          role: UserRole.CURRIER,
          deviceToken: Not(IsNull()),
          deletedAt: IsNull(),
        },
      });

      if (couriers.length === 0) {
        console.log(
          '[OrderService] No couriers with device tokens found for paid order',
        );
        return;
      }

      const priceInRubles = (order.price / 100).toFixed(2);
      const title = 'Новый оплаченный заказ';
      const body = `Заказ оплачен и готов к работе!\nАдрес: ${order.address}\nЦена: ${priceInRubles} ₽`;
      const payload = JSON.stringify({
        orderId: order.id,
        type: 'order_paid_ready',
      });

      const validTokens = couriers
        .map((courier) => courier.deviceToken)
        .filter((token): token is string => !!token);

      if (validTokens.length === 0) {
        console.log('[OrderService] No valid device tokens found for couriers');
        return;
      }

      // Отправляем уведомления всем курьерам
      const results = await Promise.allSettled(
        validTokens.map((token) =>
          this.fcmService.sendNotificationToDevice(token, title, body, payload),
        ),
      );

      const successCount = results.filter(
        (r) => r.status === 'fulfilled' && r.value.success,
      ).length;
      const failureCount = results.length - successCount;

      console.log(
        `[OrderService] Push notifications sent to couriers about paid order ${order.id}: ${successCount} success, ${failureCount} failed`,
      );
    } catch (error) {
      console.error(
        '[OrderService] Error sending push notifications to couriers about paid order:',
        error,
      );
      // Не блокируем создание заказа из-за ошибки уведомлений
    }
  }
}
