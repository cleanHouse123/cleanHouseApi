import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ScheduledOrdersService } from './services/scheduled-orders.service';
import { AdminGuard } from '../auth/guards/admin.guard';
import {
  CreateScheduledOrderDto,
  UpdateScheduledOrderDto,
  ScheduledOrderResponseDto,
} from './dto/scheduled-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../shared/decorators/get-user.decorator';

interface AuthenticatedUser {
  id: string;
  userId: string;
  email: string;
  name: string;
  phone: string;
  role: string;
}

@ApiTags('scheduled-orders')
@Controller('scheduled-orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
export class ScheduledOrdersController {
  constructor(
    private readonly scheduledOrdersService: ScheduledOrdersService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Создать расписание заказов (только для подписчиков)',
  })
  @ApiResponse({
    status: 201,
    description: 'Расписание создано успешно',
    type: ScheduledOrderResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Нет активной подписки или превышен лимит заказов',
  })
  async createScheduledOrder(
    @Body() createScheduledOrderDto: CreateScheduledOrderDto,
    @GetUser() user: AuthenticatedUser,
  ): Promise<ScheduledOrderResponseDto> {
    return this.scheduledOrdersService.createScheduledOrder(
      createScheduledOrderDto,
      user.id,
    );
  }

  @Post('run')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Прогнать расписания сейчас, не дожидаясь крона',
    description:
      'Создаёт заказы по тем расписаниям, которым подошло время. ' +
      'Нужен, чтобы проверить движок и вручную догнать пропущенное, ' +
      'если крон стоял',
  })
  @ApiResponse({ status: 201, description: 'Расписания обработаны' })
  async runNow(): Promise<{ message: string }> {
    await this.scheduledOrdersService.processScheduledOrders();

    return { message: 'Расписания обработаны' };
  }

  @Get('my-schedules')
  @ApiOperation({ summary: 'Получить мои расписания' })
  @ApiResponse({
    status: 200,
    description: 'Список расписаний клиента',
    type: [ScheduledOrderResponseDto],
  })
  async getMySchedules(
    @GetUser() user: AuthenticatedUser,
  ): Promise<ScheduledOrderResponseDto[]> {
    return this.scheduledOrdersService.getCustomerSchedules(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить расписание по ID' })
  @ApiResponse({
    status: 200,
    description: 'Расписание найдено',
    type: ScheduledOrderResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Чужое расписание' })
  @ApiResponse({ status: 404, description: 'Расписание не найдено' })
  async getScheduleById(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: AuthenticatedUser,
  ): Promise<ScheduledOrderResponseDto> {
    return this.scheduledOrdersService.getScheduleById(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить расписание' })
  @ApiResponse({
    status: 200,
    description: 'Расписание обновлено',
    type: ScheduledOrderResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Чужое расписание' })
  @ApiResponse({ status: 404, description: 'Расписание не найдено' })
  async updateSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateScheduledOrderDto: UpdateScheduledOrderDto,
    @GetUser() user: AuthenticatedUser,
  ): Promise<ScheduledOrderResponseDto> {
    return this.scheduledOrdersService.updateSchedule(
      id,
      updateScheduledOrderDto,
      user.id,
    );
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Активировать расписание' })
  @ApiResponse({
    status: 200,
    description: 'Расписание активировано',
    type: ScheduledOrderResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Чужое расписание' })
  @ApiResponse({ status: 404, description: 'Расписание не найдено' })
  async activateSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: AuthenticatedUser,
  ): Promise<ScheduledOrderResponseDto> {
    return this.scheduledOrdersService.activateSchedule(id, user.id);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Деактивировать расписание' })
  @ApiResponse({
    status: 200,
    description: 'Расписание деактивировано',
    type: ScheduledOrderResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Чужое расписание' })
  @ApiResponse({ status: 404, description: 'Расписание не найдено' })
  async deactivateSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: AuthenticatedUser,
  ): Promise<ScheduledOrderResponseDto> {
    return this.scheduledOrdersService.deactivateSchedule(id, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить расписание' })
  @ApiResponse({ status: 200, description: 'Расписание удалено' })
  @ApiResponse({ status: 403, description: 'Чужое расписание' })
  @ApiResponse({ status: 403, description: 'Чужое расписание' })
  @ApiResponse({ status: 404, description: 'Расписание не найдено' })
  async deleteSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.scheduledOrdersService.deleteSchedule(id, user.id);
  }
}
