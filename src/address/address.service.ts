import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AddressResponseDto } from './dto/address-response.dto';
import { AddressCache } from './entities/address-cache.entity';
import { DaDataAddressResponse, DaDataAddressSuggestion } from './interfaces/address-data.interface';

@Injectable()
export class AddressService {
  constructor(
    @InjectRepository(AddressCache)
    private readonly addressCacheRepository: Repository<AddressCache>,
  ) {}

  async findAll(query: string): Promise<AddressResponseDto[]> {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const normalizedQuery = this.normalizeQuery(query);
    
    const cachedResults = await this.findInCache(normalizedQuery);
    if (cachedResults.length > 0) {
      await this.updateSearchStats(normalizedQuery);
      return cachedResults;
    }

    return await this.findInApiAndSaveToCache(query, normalizedQuery);
  }

  private normalizeQuery(query: string): string {
    return query.trim().toLowerCase();
  }

  private async findInApiAndSaveToCache(query: string, normalizedQuery: string): Promise<AddressResponseDto[]> {
    try {
        const apiResults = await this.searchInDaData(query);
        
        if (apiResults.length > 0) {
          await this.saveToCache(normalizedQuery, apiResults);
        }
        
        return apiResults;
      } catch (error) {
        console.error('Ошибка при поиске в DaData API:', error);
        throw new Error('Не удалось получить адреса');
      }
  }

  private async findInCache(query: string): Promise<AddressResponseDto[]> {
    try {
      let cacheEntry = await this.addressCacheRepository.findOne({
        where: { query },
        order: { last_searched_at: 'DESC' }
      });

      if (!cacheEntry) {
        cacheEntry = await this.addressCacheRepository
          .createQueryBuilder('cache')
          .where('cache.query ILIKE :query', { query: `%${query}%` })
          .orderBy('cache.search_count', 'DESC')
          .addOrderBy('cache.last_searched_at', 'DESC')
          .limit(1)
          .getOne();
      }

      if (cacheEntry) {
        return cacheEntry.cached_results;
      }

      return [];
    } catch (error) {
      console.error('Ошибка при поиске в кэше:', error);
      return [];
    }
  }

  private async updateSearchStats(query: string): Promise<void> {
    try {
      await this.addressCacheRepository
        .createQueryBuilder()
        .update(AddressCache)
        .set({
          search_count: () => 'search_count + 1',
          last_searched_at: new Date()
        })
        .where('query = :query', { query })
        .execute();
    } catch (error) {
      console.error('Ошибка при обновлении статистики поиска:', error);
    }
  }

  private async saveToCache(query: string, results: AddressResponseDto[]): Promise<void> {
    try {
      const cityOrSettlement = results[0]?.city_or_settlement || null;

      const cacheEntry = this.addressCacheRepository.create({
        query,
        city_or_settlement: cityOrSettlement,
        cached_results: results,
        search_count: 1,
        last_searched_at: new Date()
      });

      await this.addressCacheRepository.save(cacheEntry);
    } catch (error) {
      console.error('Ошибка при сохранении в кэш:', error);
    }
  }

  private async searchInDaData(query: string): Promise<AddressResponseDto[]> {
    try {
      const url = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address';
      const token = '8c514de4553ad490a0c95f2c8a51385ecb1afd31'; // Замените на ваш API-ключ

      const locations = [
        { city: 'Кудрово' },
        { city: 'Колтуши' },
        { settlement: "Янино-1" },
        { settlement: "Янино-2" },
      ];

      const options = {
        method: 'POST',
        mode: 'cors' as RequestMode,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': 'Token ' + token,
        },
        body: JSON.stringify({
          query: query,
          locations: locations,
          from_bound: { value: 'street' },
          to_bound: { value: 'house' },
          restrict_value: false,
        }),
      };

      const response = await fetch(url, options);
      const result: DaDataAddressResponse = await response.json();

      if (!result || !Array.isArray(result.suggestions)) return [];

      // Нормализуем ответ под привязку адреса на фронте, учитываем случаи без city (только settlement/мкр)
      return result.suggestions.map((s: DaDataAddressSuggestion): AddressResponseDto => {
        const d = s?.data ?? {};
        const cityOrSettlement = d.city || d.settlement || null;
        const cityOrSettlementWithType = d.city_with_type || d.settlement_with_type || null;
        const isMicroDistrict = d.settlement_type === 'мкр';
        const display = [
          d.region_with_type,
          d.area_with_type,
          cityOrSettlementWithType,
          d.street_with_type,
          d.house,
        ].filter(Boolean).join(', ');

        return {
          value: s.value,
          unrestricted_value: s.unrestricted_value,
          display,
          region: d.region,
          region_with_type: d.region_with_type,
          area: d.area,
          area_with_type: d.area_with_type,
          city: d.city,
          city_with_type: d.city_with_type,
          settlement: d.settlement,
          settlement_with_type: d.settlement_with_type,
          is_microdistrict: isMicroDistrict,
          city_or_settlement: cityOrSettlement,
          street: d.street,
          street_with_type: d.street_with_type,
          house: d.house,
          postal_code: d.postal_code,
          geo_lat: d.geo_lat,
          geo_lon: d.geo_lon,
          fias_id: d.fias_id,
          fias_level: d.fias_level,
          kladr_id: d.kladr_id,
          okato: d.okato,
          oktmo: d.oktmo,
          tax_office: d.tax_office,
        };
      });
    } catch (error) {
      throw new Error('Не удалось получить адреса');
    }
  }

  async cleanOldCache(daysOld: number = 30): Promise<{ deletedCount: number }> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await this.addressCacheRepository
        .createQueryBuilder()
        .delete()
        .where('last_searched_at < :cutoffDate', { cutoffDate })
        .execute();

      console.log(`Очищено ${result.affected} устаревших записей кэша`);
      return { deletedCount: result.affected || 0 };
    } catch (error) {
      console.error('Ошибка при очистке старого кэша:', error);
      throw new Error('Не удалось очистить кэш');
    }
  }

  async limitCacheSize(maxRecords: number = 1000): Promise<{ deletedCount: number }> {
    try {
      const totalCount = await this.addressCacheRepository.count();
      
      if (totalCount <= maxRecords) {
        return { deletedCount: 0 };
      }

      const recordsToKeep = await this.addressCacheRepository
        .createQueryBuilder('cache')
        .select('cache.id')
        .orderBy('cache.search_count', 'DESC')
        .addOrderBy('cache.last_searched_at', 'DESC')
        .limit(maxRecords)
        .getMany();

      const idsToKeep = recordsToKeep.map(record => record.id);

      const result = await this.addressCacheRepository
        .createQueryBuilder()
        .delete()
        .where('id NOT IN (:...ids)', { ids: idsToKeep })
        .execute();

      console.log(`Ограничен размер кэша: удалено ${result.affected} записей`);
      return { deletedCount: result.affected || 0 };
    } catch (error) {
      console.error('Ошибка при ограничении размера кэша:', error);
      throw new Error('Не удалось ограничить размер кэша');
    }
  }

  async clearAllCache(): Promise<{ deletedCount: number }> {
    try {
      const result = await this.addressCacheRepository
        .createQueryBuilder()
        .delete()
        .execute();

      console.log(`Полностью очищен кэш: удалено ${result.affected} записей`);
      return { deletedCount: result.affected || 0 };
    } catch (error) {
      console.error('Ошибка при полной очистке кэша:', error);
      throw new Error('Не удалось очистить кэш');
    }
  }

  async getCacheStats(): Promise<{
    total: number;
    mostSearched: Array<{
      query: string;
      search_count: number;
      last_searched_at: Date;
      city_or_settlement: string | null;
    }>;
    recentSearches: Array<{
      query: string;
      last_searched_at: Date;
      search_count: number;
    }>;
  }> {
    try {
      const total = await this.addressCacheRepository.count();
      
      const mostSearched = await this.addressCacheRepository
        .createQueryBuilder('cache')
        .select([
          'cache.query',
          'cache.search_count',
          'cache.last_searched_at',
          'cache.city_or_settlement'
        ])
        .orderBy('cache.search_count', 'DESC')
        .limit(10)
        .getMany();

      const recentSearches = await this.addressCacheRepository
        .createQueryBuilder('cache')
        .select([
          'cache.query',
          'cache.last_searched_at',
          'cache.search_count'
        ])
        .orderBy('cache.last_searched_at', 'DESC')
        .limit(10)
        .getMany();

      return { total, mostSearched, recentSearches };
    } catch (error) {
      console.error('Ошибка при получении статистики кэша:', error);
      return { total: 0, mostSearched: [], recentSearches: [] };
    }
  }

  async performMaintenance(): Promise<{
    oldRecordsDeleted: number;
    excessRecordsDeleted: number;
    totalDeleted: number;
  }> {
    try {
      console.log('Начинаем обслуживание кэша...');
      
      const oldResult = await this.cleanOldCache(30);
      
      const excessResult = await this.limitCacheSize(1000);
      
      const totalDeleted = oldResult.deletedCount + excessResult.deletedCount;
      
      console.log(`Обслуживание кэша завершено. Удалено записей: ${totalDeleted}`);
      
      return {
        oldRecordsDeleted: oldResult.deletedCount,
        excessRecordsDeleted: excessResult.deletedCount,
        totalDeleted
      };
    } catch (error) {
      console.error('Ошибка при обслуживании кэша:', error);
      throw new Error('Не удалось выполнить обслуживание кэша');
    }
  }
}