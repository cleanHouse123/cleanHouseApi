import { Controller, Get, Query, Delete, Post, Body, Param } from '@nestjs/common';
import { AddressService } from './service/address.service';
import { ApiBody, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AddressResponseDto } from './dto/address-response.dto';
import { CreateLocationDto, LocationDto } from './dto/location.dto';
import { Location } from './entities/location.entity';

@ApiTags('address')
@Controller('address')
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  @ApiOperation({ summary: 'Получить локации поиска адрессов' })
  @ApiResponse({
    status: 200,
    description: 'Список всех локаций поиска адрессов',
    type: [Location],
  })
  @Get('locations')
  async getLocations(): Promise<LocationDto[]> {
    return this.addressService.getLocations();
  }

  @ApiOperation({ summary: 'Создать локацию поиска адрессов' })
  @ApiBody({ type: CreateLocationDto })
  @ApiResponse({
    status: 200,
    description: 'Локация поиска адрессов',
    type: LocationDto,
  })
  @Post('locations')
  async createLocation(@Body() location: CreateLocationDto): Promise<LocationDto> {
    return this.addressService.createLocation(location);
  }

  @ApiOperation({ summary: 'Удалить локацию поиска адрессов' })
  @ApiResponse({
    status: 200,
    description: 'Локация поиска адрессов',
    type: LocationDto,
  })
  @Delete('locations/:id')
  async deleteLocation(@Param('id') id: string): Promise<void> {
    return this.addressService.deleteLocation(id);
  }

  @ApiOperation({ summary: 'Поиск адресов с автокомплитом и кэшированием' })
  @ApiQuery({ name: 'query', type: String, description: 'Поисковый запрос (минимум 2 символа)' })
  @ApiResponse({
    status: 200,
    description: 'Список найденных адресов',
    type: [AddressResponseDto],
  })
  @Get()
  async findAll(@Query('query') query: string): Promise<AddressResponseDto[]> {
    return this.addressService.findAll(query);
  }

  @ApiOperation({ summary: 'Получить статистику кэша адресов' })
  @ApiResponse({
    status: 200,
    description: 'Статистика кэша',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number', description: 'Общее количество записей в кэше' },
        mostSearched: {
          type: 'array',
          description: 'Самые популярные запросы',
          items: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              search_count: { type: 'number' },
              last_searched_at: { type: 'string', format: 'date-time' },
              city_or_settlement: { type: 'string', nullable: true }
            }
          }
        },
        recentSearches: {
          type: 'array',
          description: 'Недавние поиски',
          items: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              last_searched_at: { type: 'string', format: 'date-time' },
              search_count: { type: 'number' }
            }
          }
        }
      }
    }
  })
  @Get('cache/stats')
  async getCacheStats() {
    return this.addressService.getCacheStats();
  }

  @ApiOperation({ summary: 'Очистить устаревшие записи кэша' })
  @ApiQuery({ 
    name: 'days', 
    type: Number, 
    required: false, 
    description: 'Количество дней (по умолчанию 30)' 
  })
  @Delete('cache/clean')
  async cleanOldCache(@Query('days') days?: number) {
    const result = await this.addressService.cleanOldCache(days);
    return {
      message: `Очищено ${result.deletedCount} устаревших записей`,
      deletedCount: result.deletedCount
    };
  }

  @ApiOperation({ summary: 'Ограничить размер кэша' })
  @ApiQuery({ 
    name: 'maxRecords', 
    type: Number, 
    required: false, 
    description: 'Максимальное количество записей (по умолчанию 1000)' 
  })
  @Delete('cache/limit')
  async limitCacheSize(@Query('maxRecords') maxRecords?: number) {
    const result = await this.addressService.limitCacheSize(maxRecords);
    return {
      message: `Ограничен размер кэша. Удалено ${result.deletedCount} записей`,
      deletedCount: result.deletedCount
    };
  }

  @ApiOperation({ summary: 'Полная очистка кэша' })

  @Delete('cache/clear')
  async clearAllCache() {
    const result = await this.addressService.clearAllCache();
    return {
      message: `Полностью очищен кэш. Удалено ${result.deletedCount} записей`,
      deletedCount: result.deletedCount
    };
  }

  @ApiOperation({ summary: 'Комплексное обслуживание кэша' })
  @Post('cache/maintenance')
  async performMaintenance() {
    const result = await this.addressService.performMaintenance();
    return {
      message: `Обслуживание кэша завершено. Удалено ${result.totalDeleted} записей`,
      ...result
    };
  }

  @ApiOperation({ summary: 'Проверить, поддерживается ли адрес' })
  @ApiBody({ type: AddressResponseDto })
  @ApiResponse({
    status: 200,
    description: 'Адрес поддерживается',
    type: Boolean,
  })
  @Post('is-supportable')
  async isSupportableAddress(@Body() address: AddressResponseDto): Promise<boolean> {
    return this.addressService.isSupportableAddress(address);
  }
}
