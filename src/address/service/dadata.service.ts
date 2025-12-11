import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AddressResponseDto } from '../dto/address-response.dto';
import {
  DaDataAddressResponse,
  DaDataAddressSuggestion,
} from '../interfaces/address-data.interface';
import { Location } from '../entities/location.entity';

@Injectable()
export class DaDataService {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
  ) {}

  async searchAddresses(query: string, withLocations: boolean = true): Promise<AddressResponseDto[]> {
    try {
      const url =
        'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address';
      const token = '8c514de4553ad490a0c95f2c8a51385ecb1afd31'; // TODO: вынести в конфигурацию

      const locations = withLocations ? await this.locationRepository.find() : [];
      const locationsData = locations.map((location) => ({
        city: location.city,
        settlement: location.settlement,
        area: location.area,
        region: location.region,
        street: location.street,
      }));

      const response = await fetch(url, {
        method: 'POST',
        mode: 'cors' as RequestMode,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Token ${token}`,
        },
        body: JSON.stringify({
          query,
          ...(withLocations ? { locations: locationsData } : {}),
          locations_boost: [
            { kladr_id: '78' },
            { kladr_id: '47' },
          ],
          from_bound: { value: 'street' },
          to_bound: { value: 'house' },
          restrict_value: false,
        }),
      });

      const result: DaDataAddressResponse = await response.json();
      if (!result || !Array.isArray(result.suggestions)) return [];

      return result.suggestions.map(
        (suggestion: DaDataAddressSuggestion): AddressResponseDto => {
          const data = suggestion?.data ?? {};
          const cityOrSettlement = data.city || data.settlement || null;
          const cityOrSettlementWithType =
            data.city_with_type || data.settlement_with_type || null;
          const isMicroDistrict = data.settlement_type === 'мкр';

          const display = [
            data.region_with_type,
            data.area_with_type,
            cityOrSettlementWithType,
            data.street_with_type,
            data.house,
          ]
            .filter(Boolean)
            .join(', ');

          return {
            value: suggestion.value,
            unrestricted_value: suggestion.unrestricted_value,
            display,
            region: data.region,
            region_with_type: data.region_with_type,
            area: data.area,
            area_with_type: data.area_with_type,
            city: data.city,
            city_with_type: data.city_with_type,
            settlement: data.settlement,
            settlement_with_type: data.settlement_with_type,
            is_microdistrict: isMicroDistrict,
            city_or_settlement: cityOrSettlement,
            street: data.street,
            street_with_type: data.street_with_type,
            house: data.house,
            postal_code: data.postal_code,
            geo_lat: data.geo_lat,
            geo_lon: data.geo_lon,
            fias_id: data.fias_id,
            fias_level: data.fias_level,
            kladr_id: data.kladr_id,
            okato: data.okato,
            oktmo: data.oktmo,
            tax_office: data.tax_office,
          };
        },
      );
    } catch (error) {
      throw new Error('Не удалось получить адреса');
    }
  }


  async isSupportableAddress(address: AddressResponseDto): Promise<boolean> {
    const { region, area, city, settlement, street } = address;
    if (!region || !area || !city || !settlement || !street) return false;

    const locations = await this.locationRepository.find();
    console.log(locations, "locationslocationslocationslocationslocations");
    
    const locationsData = locations.map((location) => ({
      city: location.city,
      settlement: location.settlement,
      area: location.area,
      region: location.region,
      street: location.street,
    }));

    return locationsData.some((location) => 
        location.region === region ||
        location.area === area ||
        location.city === city ||
        location.settlement === settlement ||
        location.street === street
      );
  }

  async isSupportableAddressByDaData(address: AddressResponseDto): Promise<boolean> {
    const { display } = address;

    const result = await this.searchAddresses(display, true);
    return result.length > 0;
  }
}