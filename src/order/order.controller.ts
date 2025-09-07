import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrderStatus } from './entities/order.entity';

@ApiTags('orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @ApiOperation({ summary: 'Создать новый заказ' })
  @ApiResponse({
    status: 201,
    description: 'Заказ успешно создан',
    type: OrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Неверные данные' })
  @ApiResponse({ status: 404, description: 'Клиент не найден' })
  async create(
    @Body() createOrderDto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    return this.orderService.create(createOrderDto);
  }

  @Get()
  @ApiOperation({ summary: 'Получить список заказов' })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Номер страницы',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Количество на странице',
    example: 10,
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: OrderStatus,
    description: 'Фильтр по статусу',
  })
  @ApiQuery({
    name: 'customerId',
    required: false,
    description: 'Фильтр по клиенту',
  })
  @ApiQuery({
    name: 'currierId',
    required: false,
    description: 'Фильтр по курьеру',
  })
  @ApiResponse({
    status: 200,
    description: 'Список заказов',
    schema: {
      type: 'object',
      properties: {
        orders: {
          type: 'array',
          items: { $ref: '#/components/schemas/OrderResponseDto' },
        },
        total: { type: 'number' },
      },
    },
  })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: OrderStatus,
    @Query('customerId') customerId?: string,
    @Query('currierId') currierId?: string,
  ) {
    return this.orderService.findAll(
      page,
      limit,
      status,
      customerId,
      currierId,
    );
  }

  @Get('customer/:customerId')
  @ApiOperation({ summary: 'Получить заказы клиента' })
  @ApiResponse({
    status: 200,
    description: 'Заказы клиента',
    type: [OrderResponseDto],
  })
  async getOrdersByCustomer(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ): Promise<OrderResponseDto[]> {
    return this.orderService.getOrdersByCustomer(customerId);
  }

  @Get('currier/:currierId')
  @ApiOperation({ summary: 'Получить заказы курьера' })
  @ApiResponse({
    status: 200,
    description: 'Заказы курьера',
    type: [OrderResponseDto],
  })
  async getOrdersByCurrier(
    @Param('currierId', ParseUUIDPipe) currierId: string,
  ): Promise<OrderResponseDto[]> {
    return this.orderService.getOrdersByCurrier(currierId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить заказ по ID' })
  @ApiResponse({
    status: 200,
    description: 'Заказ найден',
    type: OrderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Заказ не найден' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderResponseDto> {
    return this.orderService.findOne(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Обновить статус заказа' })
  @ApiResponse({
    status: 200,
    description: 'Статус заказа обновлен',
    type: OrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Неверный переход статуса' })
  @ApiResponse({ status: 404, description: 'Заказ не найден' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateOrderStatusDto: UpdateOrderStatusDto,
  ): Promise<OrderResponseDto> {
    return this.orderService.updateStatus(id, updateOrderStatusDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить заказ' })
  @ApiResponse({ status: 200, description: 'Заказ удален' })
  @ApiResponse({
    status: 400,
    description: 'Нельзя удалить заказ в процессе выполнения',
  })
  @ApiResponse({ status: 404, description: 'Заказ не найден' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.orderService.remove(id);
  }

  // ==================== COURIER METHODS ====================

  @Patch(':id/take')
  @ApiOperation({ summary: 'Курьер берет заказ' })
  @ApiResponse({
    status: 200,
    description: 'Заказ успешно взят курьером',
    type: OrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Заказ уже взят или недоступен' })
  @ApiResponse({ status: 404, description: 'Заказ не найден' })
  async takeOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { courierId: string },
  ): Promise<OrderResponseDto> {
    return this.orderService.takeOrder(id, body.courierId);
  }

  @Patch(':id/start')
  @ApiOperation({ summary: 'Курьер начинает выполнение заказа' })
  @ApiResponse({
    status: 200,
    description: 'Заказ начат к выполнению',
    type: OrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Заказ не может быть начат' })
  @ApiResponse({ status: 404, description: 'Заказ не найден' })
  async startOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { courierId: string },
  ): Promise<OrderResponseDto> {
    return this.orderService.startOrder(id, body.courierId);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Курьер завершает заказ' })
  @ApiResponse({
    status: 200,
    description: 'Заказ успешно завершен',
    type: OrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Заказ не может быть завершен' })
  @ApiResponse({ status: 404, description: 'Заказ не найден' })
  async completeOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { courierId: string },
  ): Promise<OrderResponseDto> {
    return this.orderService.completeOrder(id, body.courierId);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Курьер отменяет заказ' })
  @ApiResponse({
    status: 200,
    description: 'Заказ отменен курьером',
    type: OrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Заказ не может быть отменен' })
  @ApiResponse({ status: 404, description: 'Заказ не найден' })
  async cancelOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { courierId: string; reason?: string },
  ): Promise<OrderResponseDto> {
    return this.orderService.cancelOrder(id, body.courierId, body.reason);
  }
}
