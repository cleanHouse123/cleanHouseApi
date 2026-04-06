import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AddressResponseDto } from '../dto/address-response.dto';
import {
  DaDataAddressResponse,
  DaDataAddressSuggestion,
  DaDataSuggestLocationFilter,
} from '../interfaces/address-data.interface';
import { Location } from '../entities/location.entity';

/**
 * Если в БД нет строк — подставляется из env (`DADATA_SUGGEST_LOCATIONS`) или этот список.
 * Совпадает с продовым набором районов; муниципальные округа — через `sub_area` в БД или в env.
 */
const DEFAULT_SUGGEST_LOCATIONS: DaDataSuggestLocationFilter[] = [
  { city: 'Кудрово' },
  { city: 'Колтуши' },
  { settlement: 'Янино-1' },
  { settlement: 'Янино-2' },
  { region: 'Ленинградская', area: 'Всеволожский' },
  {
    region: 'Ленинградская',
    area: 'Всеволожский',
    settlement: 'Микрорайон южный',
  },
  { city: 'Санкт-Петербург', city_district: 'Петроградский' },
];

function locationToDaDataFilter(
  location: Location,
): DaDataSuggestLocationFilter {
  return {
    region: location.region ?? undefined,
    area: location.area ?? undefined,
    city: location.city ?? undefined,
    settlement: location.settlement ?? undefined,
    street: location.street ?? undefined,
    city_district: location.city_district ?? undefined,
    sub_area: location.sub_area ?? undefined,
  };
}

function isSaintPetersburgCityName(city: string | null | undefined): boolean {
  const c = city?.trim();
  if (!c) return true;
  return /^санкт-петербург$/i.test(c) || /^спб$/i.test(c);
}

/**
 * «Петроградский район» в settlement — для DaData это адм. район СПб (city + city_district),
 * не населённый пункт. Раньше срабатывало только при пустом region — иначе в locations уходил
 * неверный settlement и адреса (напр. Чкаловский пр.) не находились.
 */
function normalizeLocationForDaData(location: Location): DaDataSuggestLocationFilter {
  if (location.city_district?.trim() || location.sub_area?.trim()) {
    return locationToDaDataFilter(location);
  }

  const settlement = location.settlement?.trim();
  if (
    settlement &&
    (/\bрайон\b/i.test(settlement) || /\bр-н\b/i.test(settlement)) &&
    isSaintPetersburgCityName(location.city)
  ) {
    const district = settlement
      .replace(/\s*район\s*$/i, '')
      .replace(/\s*р-н\s*$/i, '')
      .trim();
    return {
      city: 'Санкт-Петербург',
      settlement: undefined,
      street: location.street ?? undefined,
      city_district: district || settlement,
      sub_area: undefined,
    };
  }

  return locationToDaDataFilter(location);
}

function isNonEmptyFilter(
  filter: DaDataSuggestLocationFilter,
): boolean {
  return Object.values(filter).some((v) => v != null && v !== '');
}

function splitLocationsByDivisionKind(locations: DaDataSuggestLocationFilter[]): {
  administrative: DaDataSuggestLocationFilter[];
  municipal: DaDataSuggestLocationFilter[];
} {
  const administrative: DaDataSuggestLocationFilter[] = [];
  const municipal: DaDataSuggestLocationFilter[] = [];
  for (const loc of locations) {
    if (loc.sub_area != null && loc.sub_area !== '') municipal.push(loc);
    else administrative.push(loc);
  }
  return { administrative, municipal };
}

/**
 * В муниципальном делении у СПб внутригородской округ (вн.тер.г.) приходит в data.area как
 * «муниципальный округ Ланское», а data.sub_area пустой. Параметр locations с полем sub_area
 * для таких адресов не срабатывает — нужны region + area.
 */
function expandMunicipalFilterForSaintPetersburg(
  f: DaDataSuggestLocationFilter,
): DaDataSuggestLocationFilter {
  const sub = f.sub_area?.trim();
  if (!sub) return f;

  const region = f.region?.trim();
  const city = f.city?.trim();
  const regionIsSpb =
    !region ||
    /^санкт-петербург$/i.test(region) ||
    /^спб$/i.test(region);
  const cityIsSpb =
    !city ||
    /^санкт-петербург$/i.test(city) ||
    /^спб$/i.test(city);
  if (!regionIsSpb || !cityIsSpb) return f;

  const area = /муниципальный\s+округ/i.test(sub)
    ? sub
    : `муниципальный округ ${sub.replace(/^\s*муниципальный\s+округ\s*/i, '').trim()}`;

  return {
    region: 'Санкт-Петербург',
    area,
    street: f.street ?? undefined,
    settlement: f.settlement ?? undefined,
  };
}

function dedupeSuggestions(
  lists: AddressResponseDto[][],
): AddressResponseDto[] {
  const seen = new Set<string>();
  const out: AddressResponseDto[] = [];
  for (const list of lists) {
    for (const item of list) {
      const key = item.unrestricted_value || item.value;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

@Injectable()
export class DaDataService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
  ) {}

  private parseBaseSuggestLocations(): DaDataSuggestLocationFilter[] {
    const fromEnv = this.configService.get<string>('DADATA_SUGGEST_LOCATIONS');
    if (!fromEnv?.trim()) return DEFAULT_SUGGEST_LOCATIONS;
    try {
      const parsed = JSON.parse(fromEnv) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0)
        return parsed as DaDataSuggestLocationFilter[];
    } catch {
      /* оставляем DEFAULT_SUGGEST_LOCATIONS */
    }
    return DEFAULT_SUGGEST_LOCATIONS;
  }

  /**
   * Секторы DaData: строки из БД (`location`), иначе env/DEFAULT.
   * Ленинградская область / города / НП — в административном делении;
   * поле `sub_area` — муниципальный сектор (отдельный запрос с division=municipal).
   */
  private async buildLocationsPayload(): Promise<DaDataSuggestLocationFilter[]> {
    const rows = await this.locationRepository.find();
    const fromDb = rows
      .map(normalizeLocationForDaData)
      .filter(isNonEmptyFilter);
    if (fromDb.length > 0) return fromDb;
    return this.parseBaseSuggestLocations();
  }

  private mapSuggestionsToDto(
    result: DaDataAddressResponse,
  ): AddressResponseDto[] {
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
  }

  private async fetchSuggestions(
    query: string,
    token: string,
    division: 'administrative' | 'municipal',
    locations: DaDataSuggestLocationFilter[],
  ): Promise<AddressResponseDto[]> {
    if (locations.length === 0) return [];

    const locationsPayload =
      division === 'municipal'
        ? locations.map(expandMunicipalFilterForSaintPetersburg)
        : locations;

    const url =
      'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address';

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
        division,
        locations: locationsPayload,
        locations_boost: [{ kladr_id: '78' }, { kladr_id: '47' }],
        from_bound: { value: 'street' },
        to_bound: { value: 'house' },
        restrict_value: false,
      }),
    });

    const result: DaDataAddressResponse = await response.json();
    return this.mapSuggestionsToDto(result);
  }

  async searchAddresses(query: string): Promise<AddressResponseDto[]> {
    try {
      const token =
        this.configService.get<string>('DADATA_TOKEN') ||
        this.configService.get<string>('DADATA_API_KEY');
      if (!token) {
        throw new Error(
          'Задайте DADATA_TOKEN (или DADATA_API_KEY) в окружении',
        );
      }

      const locationsPayload = await this.buildLocationsPayload();
      const { administrative, municipal } =
        splitLocationsByDivisionKind(locationsPayload);

      const lists: AddressResponseDto[][] = [];
      if (administrative.length > 0)
        lists.push(
          await this.fetchSuggestions(
            query,
            token,
            'administrative',
            administrative,
          ),
        );
      if (municipal.length > 0)
        lists.push(
          await this.fetchSuggestions(query, token, 'municipal', municipal),
        );

      return dedupeSuggestions(lists);
    } catch (error) {
      throw new Error('Не удалось получить адреса');
    }
  }

  async isSupportableAddress(address: AddressResponseDto): Promise<boolean> {
    const { region, area, city, settlement, street } = address;
    if (!region || !area || !city || !settlement || !street) return false;

    const locations = await this.locationRepository.find();

    const locationsData = locations.map((location) => ({
      city: location.city,
      settlement: location.settlement,
      area: location.area,
      region: location.region,
      street: location.street,
    }));

    return locationsData.some(
      (location) =>
        location.region === region ||
        location.area === area ||
        location.city === city ||
        location.settlement === settlement ||
        location.street === street,
    );
  }

  async isSupportableAddressByDaData(
    address: AddressResponseDto,
  ): Promise<boolean> {
    const { display } = address;

    const result = await this.searchAddresses(display);
    return result.length > 0;
  }
}
