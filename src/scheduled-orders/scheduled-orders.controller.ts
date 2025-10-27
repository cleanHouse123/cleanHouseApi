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
import { CreateScheduledOrderDto, UpdateScheduledOrderDto, ScheduledOrderResponseDto } from './dto/scheduled-order.dto';
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
  @ApiOperation({ summary: 'Создать расписание заказов (только для подписчиков)' })
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
    return this.scheduledOrdersService.createScheduledOrder(createScheduledOrderDto, user.id);
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
  @ApiResponse({ status: 404, description: 'Расписание не найдено' })
  async getScheduleById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ScheduledOrderResponseDto> {
    return this.scheduledOrdersService.getScheduleById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить расписание' })
  @ApiResponse({
    status: 200,
    description: 'Расписание обновлено',
    type: ScheduledOrderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Расписание не найдено' })
  async updateSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateScheduledOrderDto: UpdateScheduledOrderDto,
  ): Promise<ScheduledOrderResponseDto> {
    return this.scheduledOrdersService.updateSchedule(id, updateScheduledOrderDto);
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Активировать расписание' })
  @ApiResponse({
    status: 200,
    description: 'Расписание активировано',
    type: ScheduledOrderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Расписание не найдено' })
  async activateSchedule(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ScheduledOrderResponseDto> {
    return this.scheduledOrdersService.activateSchedule(id);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Деактивировать расписание' })
  @ApiResponse({
    status: 200,
    description: 'Расписание деактивировано',
    type: ScheduledOrderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Расписание не найдено' })
  async deactivateSchedule(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ScheduledOrderResponseDto> {
    return this.scheduledOrdersService.deactivateSchedule(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить расписание' })
  @ApiResponse({ status: 200, description: 'Расписание удалено' })
  @ApiResponse({ status: 404, description: 'Расписание не найдено' })
  async deleteSchedule(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.scheduledOrdersService.deleteSchedule(id);
  }
}
