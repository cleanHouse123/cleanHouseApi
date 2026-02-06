import {
  Injectable,
  Logger,
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
  ArrayContains,
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
import { UserAddress } from '../address/entities/user-address';
import { AddressUsageFeature } from '../shared/types/address-features';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserAddress)
    private userAddressRepository: Repository<UserAddress>,
    private subscriptionService: SubscriptionService,
    private subscriptionLimitsService: SubscriptionLimitsService,
    private orderPaymentService: OrderPaymentService,
    private priceService: PriceService,
    private fcmService: FcmService,
    private telegramService: TelegramService,
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

    // Если передан addressId, находим user-address и проверяем принадлежность пользователю
    let userAddress: UserAddress | null = null;
    if (createOrderDto.addressId) {
      userAddress = await this.userAddressRepository.findOne({
        where: {
          id: createOrderDto.addressId,
          userId: createOrderDto.customerId,
        },
      });

      if (!userAddress) {
        throw new BadRequestException(
          'Адрес не найден или не принадлежит данному пользователю',
        );
      }
    }

    const orderPrice = await this.priceService.getOrderPrice({
      userId: createOrderDto.customerId,
      numberPackages,
      addressId: createOrderDto.addressId,
      address: createOrderDto.address,
      addressDetails: createOrderDto.addressDetails,
    });

    // Строгая проверка: если цена = 1 рубль, проверяем, что у пользователя еще нет ЛЮБОГО заказа за 1 рубль
    // Первый заказ всегда стоит 1 рубль, независимо от статуса (NEW, PAID, CANCELED и т.д.)
    if (orderPrice === 100) {
      const existingFirstOrder = await this.orderRepository.findOne({
        where: {
          customerId: createOrderDto.customerId,
          price: 100,
          // Не проверяем статус - любой заказ за 1 рубль означает, что первый заказ уже использован
        },
      });

      if (existingFirstOrder) {
        throw new BadRequestException(
          'Первый заказ за 1 рубль уже был использован. На один аккаунт разрешен только один первый заказ (независимо от статуса).',
        );
      }
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

    // Обработка времени выноса заказа (scheduledAt)
    let scheduledAt: Date | undefined;
    if (createOrderDto.scheduledAt) {
      // Если время указано, используем его
      scheduledAt = new Date(createOrderDto.scheduledAt);
      
      // Проверяем, что дата валидна
      if (isNaN(scheduledAt.getTime())) {
        throw new BadRequestException(
          'Некорректный формат времени запланированной доставки',
        );
      }
    } else {
      // Если время не указано, устанавливаем текущее время + 1 час
      const now = new Date();
      scheduledAt = new Date(now.getTime() + 60 * 60 * 1000); // +1 час
    }

    console.log('=== ORDER CREATION DEBUG ===');
    console.log(
      'Input addressDetails:',
      JSON.stringify(createOrderDto.addressDetails, null, 2),
    );
    console.log('ScheduledAt:', scheduledAt);

    const order = this.orderRepository.create({
      customerId: createOrderDto.customerId,
      address: createOrderDto.address,
      addressId: createOrderDto.addressId,
      addressDetails: createOrderDto.addressDetails,
      description: createOrderDto.description,
      price: orderPrice,
      notes: createOrderDto.notes,
      scheduledAt,
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

    // Уведомление о новом заказе в Telegram (чат из TELEGRAM_NOTIFY_CHAT_ID и курьеры с telegramId)
    this.notifyNewOrderTelegram(savedOrder, customer.name).catch((err) => {
      console.error('[OrderService] Telegram notify new order failed:', err);
    });

    // Флаг FIRST_ORDER_USED теперь устанавливается только после оплаты заказа
    // в методе updateStatus при переходе статуса на PAID

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

      // Отправляем push и Telegram курьерам о новом оплаченном заказе
      await this.notifyCouriersAboutPaidOrder(savedOrder);
      await this.notifyCouriersAboutPaidOrderTelegram(savedOrder).catch((err) => {
        this.logger.warn('[OrderService] Telegram notify paid order failed:', err);
      });
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
      isOverdue,
      customerSearch,
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

    // Фильтр по просроченным заказам
    if (isOverdue !== undefined) {
      const now = new Date();
      if (isOverdue) {
        // Просроченные: есть scheduledAt, он в прошлом, статус не DONE и не CANCELED
        queryBuilder
          .andWhere('order.scheduledAt IS NOT NULL')
          .andWhere('order.scheduledAt < :now', { now })
          .andWhere('order.status != :doneStatus', {
            doneStatus: OrderStatus.DONE,
          })
          .andWhere('order.status != :canceledStatus', {
            canceledStatus: OrderStatus.CANCELED,
          });
      } else {
        // Не просроченные: нет scheduledAt ИЛИ он в будущем ИЛИ статус DONE/CANCELED
        queryBuilder.andWhere(
          '(order.scheduledAt IS NULL OR order.scheduledAt >= :now OR order.status = :doneStatus OR order.status = :canceledStatus)',
          {
            now,
            doneStatus: OrderStatus.DONE,
            canceledStatus: OrderStatus.CANCELED,
          },
        );
      }
    }

    // Поиск по email, телефону или имени клиента
    if (customerSearch) {
      queryBuilder.andWhere(
        '(customer.name ILIKE :customerSearch OR customer.phone ILIKE :customerSearch OR customer.email ILIKE :customerSearch)',
        { customerSearch: `%${customerSearch}%` },
      );
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
      isOverdue,
      customerSearch,
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
      LEFT JOIN "user" customer ON o."customerId" = customer.id
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

    // Фильтр по просроченным заказам
    if (isOverdue !== undefined) {
      const now = new Date().toISOString();
      if (isOverdue) {
        query += ` AND o."scheduledAt" IS NOT NULL`;
        query += ` AND o."scheduledAt" < $${params.length + 1}`;
        params.push(now);
        query += ` AND o.status != $${params.length + 1}`;
        params.push(OrderStatus.DONE);
        query += ` AND o.status != $${params.length + 1}`;
        params.push(OrderStatus.CANCELED);
      } else {
        query += ` AND (o."scheduledAt" IS NULL OR o."scheduledAt" >= $${params.length + 1} OR o.status = $${params.length + 2} OR o.status = $${params.length + 3})`;
        params.push(now, OrderStatus.DONE, OrderStatus.CANCELED);
      }
    }

    // Поиск по email, телефону или имени клиента
    if (customerSearch) {
      query += ` AND (customer.name ILIKE $${params.length + 1} OR customer.phone ILIKE $${params.length + 1} OR customer.email ILIKE $${params.length + 1})`;
      params.push(`%${customerSearch}%`);
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
      LEFT JOIN "user" customer ON o."customerId" = customer.id
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

    // Фильтр по просроченным заказам для count
    if (isOverdue !== undefined) {
      const now = new Date().toISOString();
      if (isOverdue) {
        countQuery += ` AND o."scheduledAt" IS NOT NULL`;
        countQuery += ` AND o."scheduledAt" < $${countParams.length + 1}`;
        countParams.push(now);
        countQuery += ` AND o.status != $${countParams.length + 1}`;
        countParams.push(OrderStatus.DONE);
        countQuery += ` AND o.status != $${countParams.length + 1}`;
        countParams.push(OrderStatus.CANCELED);
      } else {
        countQuery += ` AND (o."scheduledAt" IS NULL OR o."scheduledAt" >= $${countParams.length + 1} OR o.status = $${countParams.length + 2} OR o.status = $${countParams.length + 3})`;
        countParams.push(now, OrderStatus.DONE, OrderStatus.CANCELED);
      }
    }

    // Поиск по клиенту для count
    if (customerSearch) {
      countQuery += ` AND (customer.name ILIKE $${countParams.length + 1} OR customer.phone ILIKE $${countParams.length + 1} OR customer.email ILIKE $${countParams.length + 1})`;
      countParams.push(`%${customerSearch}%`);
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

      if (!currier.roles?.includes(UserRole.CURRIER)) {
        throw new BadRequestException('Пользователь не является курьером');
      }

      order.currierId = updateOrderStatusDto.currierId;
    }

    const previousStatus = order.status;
    order.status = updateOrderStatusDto.status;

    await this.orderRepository.save(order);

    // Если заказ переходит в статус PAID и это первый заказ за 1 рубль, устанавливаем флаг
    if (
      updateOrderStatusDto.status === OrderStatus.PAID &&
      previousStatus !== OrderStatus.PAID &&
      order.price === 100 && // 1 рубль в копейках
      order.addressId
    ) {
      const userAddress = await this.userAddressRepository.findOne({
        where: {
          id: order.addressId,
          userId: order.customerId,
        },
      });

      if (
        userAddress &&
        !userAddress.usageFeatures.includes(AddressUsageFeature.FIRST_ORDER_USED)
      ) {
        userAddress.usageFeatures = [
          ...userAddress.usageFeatures,
          AddressUsageFeature.FIRST_ORDER_USED,
        ];
        await this.userAddressRepository.save(userAddress);
      }
    }

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

  async removeForce(id: string): Promise<void> {
    const order = await this.orderRepository.findOne({ where: { id } });

    if (!order) {
      throw new NotFoundException('Заказ не найден');
    }

    // Принудительное удаление без проверки статуса
    await this.orderRepository.remove(order);
  }

  async removeAllOrders(): Promise<{ deleted: number }> {
    // Удаляем все заказы напрямую через репозиторий
    const result = await this.orderRepository
      .createQueryBuilder()
      .delete()
      .from('order')
      .execute();

    return { deleted: result.affected || 0 };
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

  private isOrderOverdue(order: Order): {
    isOverdue: boolean;
    overdueMinutes?: number;
  } {
    // Если нет запланированного времени - не просрочен
    if (!order.scheduledAt) {
      return { isOverdue: false };
    }

    // Если заказ уже завершен или отменен - не просрочен
    if (
      order.status === OrderStatus.DONE ||
      order.status === OrderStatus.CANCELED
    ) {
      return { isOverdue: false };
    }

    const now = new Date();
    const scheduledTime = new Date(order.scheduledAt);

    // Проверяем, прошло ли запланированное время
    if (scheduledTime < now) {
      const diffMs = now.getTime() - scheduledTime.getTime();
      const overdueMinutes = Math.floor(diffMs / (1000 * 60)); // минуты

      return {
        isOverdue: true,
        overdueMinutes,
      };
    }

    return { isOverdue: false };
  }

  private transformToResponseDto(order: Order): OrderResponseDto {
    const overdueInfo = this.isOrderOverdue(order);

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
      assignedAt: order?.assignedAt || undefined,
      payments: order?.payments || [],
      createdAt: order?.createdAt || new Date(),
      updatedAt: order?.updatedAt || new Date(),
      isOverdue: overdueInfo.isOverdue,
      overdueMinutes: order?.overdueMinutes || overdueInfo.overdueMinutes,
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

    // Только оплаченные заказы можно брать
    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException(
        'Можно взять только оплаченные заказы (статус PAID)',
      );
    }

    // Проверяем, что заказ еще не назначен
    if (order.currierId) {
      throw new BadRequestException(
        'Заказ уже назначен другому курьеру. Используйте reassign для переназначения',
      );
    }

    // Проверяем, что курьер существует и имеет правильную роль
    const courier = await this.userRepository.findOne({
      where: { id: courierId },
    });

    if (!courier) {
      throw new NotFoundException('Курьер не найден');
    }

    if (!courier.roles?.includes(UserRole.CURRIER)) {
      throw new BadRequestException('Пользователь не является курьером');
    }

    // Назначаем курьера и меняем статус
    order.currierId = courierId;
    order.status = OrderStatus.ASSIGNED;
    order.assignedAt = new Date();

    // Вычисляем просроченность и сохраняем
    const overdueInfo = this.isOrderOverdue(order);
    if (overdueInfo.isOverdue) {
      order.overdueMinutes = overdueInfo.overdueMinutes;
    }

    await this.orderRepository.save(order);

    return this.findOne(orderId);
  }

  async reassignOrder(
    orderId: string,
    newCourierId: string,
  ): Promise<OrderResponseDto> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['customer', 'currier'],
    });

    if (!order) {
      throw new NotFoundException('Заказ не найден');
    }

    // Проверяем статус - можно переназначить только ASSIGNED или IN_PROGRESS
    if (
      order.status !== OrderStatus.ASSIGNED &&
      order.status !== OrderStatus.IN_PROGRESS
    ) {
      throw new BadRequestException(
        'Переназначить можно только заказы в статусе ASSIGNED или IN_PROGRESS',
      );
    }

    // Проверяем, что новый курьер существует
    const newCourier = await this.userRepository.findOne({
      where: { id: newCourierId },
    });

    if (!newCourier) {
      throw new NotFoundException('Новый курьер не найден');
    }

    if (!newCourier.roles?.includes(UserRole.CURRIER)) {
      throw new BadRequestException('Пользователь не является курьером');
    }

    // Переназначаем
    const oldCourierId = order.currierId;
    order.currierId = newCourierId;
    order.assignedAt = new Date();
    
    // Если был IN_PROGRESS, возвращаем в ASSIGNED
    if (order.status === OrderStatus.IN_PROGRESS) {
      order.status = OrderStatus.ASSIGNED;
    }

    await this.orderRepository.save(order);

    // Отправляем уведомления
    if (oldCourierId) {
      await this.fcmService.sendToUser(
        oldCourierId,
        'Заказ переназначен',
        `Заказ #${order.id.slice(-8)} был переназначен другому курьеру`,
        { orderId: order.id, type: 'order_reassigned' },
      );
    }

    await this.fcmService.sendToUser(
      newCourierId,
      'Новый заказ назначен',
      `Вам назначен заказ #${order.id.slice(-8)}`,
      { orderId: order.id, type: 'order_assigned' },
    );

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

    if (
      order.status === OrderStatus.DONE ||
      order.status === OrderStatus.CANCELED
    ) {
      throw new BadRequestException(
        'Завершенный или отмененный заказ не может быть отменен',
      );
    }

    // Проверяем, что до времени выполнения заказа осталось больше двух часов
    if (order.scheduledAt) {
      const now = new Date();
      const scheduledAt = new Date(order.scheduledAt);
      const diffMs = scheduledAt.getTime() - now.getTime();
      const twoHoursMs = 2 * 60 * 60 * 1000;

      if (diffMs <= twoHoursMs) {
        throw new BadRequestException(
          'Заказ можно отменить только более чем за 2 часа до запланированного времени',
        );
      }
    }

    if (order.currierId && order.currierId !== courierId) {
      throw new BadRequestException('Заказ назначен другому курьеру');
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

  private async notifyNewOrderTelegram(
    order: Order,
    customerName: string,
  ): Promise<void> {
    const priceRub = (Number(order.price) / 100).toFixed(2);
    const statusText =
      order.status === OrderStatus.PAID ? 'Оплачен' : 'Новый (ожидает оплаты)';
    const shortId = order.id.slice(-8);
    const scheduled =
      order.scheduledAt != null
        ? `\nДоставить до: ${new Date(order.scheduledAt).toLocaleString('ru-RU')}`
        : '';
    const text = `🆕 Новый заказ #${shortId}\nКлиент: ${customerName}\nАдрес: ${order.address}\nСумма: ${priceRub} ₽\nСтатус: ${statusText}${scheduled}`;

    const chatIds: string[] = [];

    const couriers = await this.userRepository.find({
      where: {
        roles: ArrayContains([UserRole.CURRIER]),
        telegramId: Not(IsNull()),
        deletedAt: IsNull(),
      },
    });
    couriers.forEach((c) => {
      if (c.telegramId?.trim()) chatIds.push(c.telegramId!.trim());
    });

    const uniqueChatIds = [...new Set(chatIds)];
    if (uniqueChatIds.length === 0) {
      this.logger.debug(
        '[Telegram] Нет получателей для уведомления о новом заказе ( курьеров с telegramId)',
      );
      return;
    }

    const results = await Promise.allSettled(
      uniqueChatIds.map((chatId) =>
        this.telegramService.sendMessage(chatId, text),
      ),
    );
    const ok = results.filter(
      (r) => r.status === 'fulfilled' && r.value === true,
    ).length;
    this.logger.log(
      `[Telegram] Новый заказ #${shortId}: отправлено ${ok}/${uniqueChatIds.length} (курьеров с telegramId: ${couriers.length})`,
    );
  }

  /**
   * Отправляет в Telegram уведомление курьерам с telegramId о том, что заказ оплачен и готов к работе.
   * Вызывается при создании оплаченного заказа (подписка) и из webhook при первой оплате.
   */
  async notifyCouriersAboutPaidOrderTelegram(order: Order): Promise<void> {
    const couriers = await this.userRepository.find({
      where: {
        roles: ArrayContains([UserRole.CURRIER]),
        telegramId: Not(IsNull()),
        deletedAt: IsNull(),
      },
    });
    const chatIds = couriers
      .map((c) => c.telegramId?.trim())
      .filter((id): id is string => !!id);
    if (chatIds.length === 0) return;

    const priceRub = (Number(order.price) / 100).toFixed(2);
    const shortId = order.id.slice(-8);
    const text = `✅ Оплаченный заказ #${shortId} готов к работе\nАдрес: ${order.address}\nСумма: ${priceRub} ₽`;

    const results = await Promise.allSettled(
      chatIds.map((chatId) => this.telegramService.sendMessage(chatId, text)),
    );
    const ok = results.filter(
      (r) => r.status === 'fulfilled' && r.value === true,
    ).length;
    this.logger.log(
      `[Telegram] Оплаченный заказ #${shortId}: отправлено курьерам ${ok}/${chatIds.length}`,
    );
  }

  /**
   * Отправляет push-уведомления всем курьерам о том, что заказ оплачен и готов к работе
   */
  private async notifyCouriersAboutPaidOrder(order: Order): Promise<void> {
    try {
      const couriers = await this.userRepository.find({
        where: {
          roles: ArrayContains([UserRole.CURRIER]),
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
