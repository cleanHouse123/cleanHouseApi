import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { UserAddressService } from '../service/user-address.service';
import { UserAddress } from '../entities/user-address';

@ApiTags('admin-user-address')
@Controller('admin/user-address')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
export class AdminAddressController {
  constructor(private readonly userAddressService: UserAddressService) {}

  @ApiOperation({ summary: 'Получить список всех адресов с пагинацией и фильтрацией' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Номер страницы' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Количество записей на странице' })
  @ApiQuery({ name: 'userId', required: false, type: String, description: 'Фильтр по ID пользователя' })
  @ApiQuery({ name: 'addressName', required: false, type: String, description: 'Поиск по названию адреса' })
  @ApiResponse({
    status: 200,
    description: 'Список адресов с пагинацией',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { $ref: '#/components/schemas/UserAddress' },
        },
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' },
      },
    },
  })
  @Get()
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('userId') userId?: string,
    @Query('addressName') addressName?: string,
  ) {
    return this.userAddressService.findAllWithPagination({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      userId,
      addressName,
    });
  }

  @ApiOperation({ summary: 'Получить самые встречающиеся улицы' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Количество улиц (по умолчанию 10)' })
  @ApiResponse({
    status: 200,
    description: 'Список самых встречающихся улиц',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          street: { type: 'string' },
          count: { type: 'number' },
        },
      },
    },
  })
  @Get('most-common-streets')
  async getMostCommonStreets(@Query('limit') limit?: number) {
    const limitNumber = limit ? Number(limit) : 10;
    return this.userAddressService.getMostCommonStreets(limitNumber);
  }
}

