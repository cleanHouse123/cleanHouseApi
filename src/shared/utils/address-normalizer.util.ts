import { DaDataAddressDataNormalized } from '../../address/interfaces/address-data.interface';

export interface AddressDetailsComparable {
  building?: number;
  buildingBlock?: string;
  apartment?: number;
  entrance?: string;
}

function normalizeText(value?: string | null): string {
  if (!value) {
    return '';
  }
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

function normalizePart(value?: string | number | null): string {
  if (value === undefined || value === null) {
    return '';
  }
  return normalizeText(String(value));
}

/**
 * Собирает строку для сравнения адресов, включая квартиру.
 */
export function normalizeAddressForComparison(
  address: string,
  addressDetails?: AddressDetailsComparable | null,
): string {
  const normalizedAddress = normalizeText(address);

  const parts = [
    normalizedAddress,
    normalizePart(addressDetails?.building),
    normalizePart(addressDetails?.buildingBlock),
    normalizePart(addressDetails?.apartment),
    normalizePart(addressDetails?.entrance),
  ].filter(Boolean);

  return parts.join('|');
}

/**
 * Сравнивает два адреса DaData по ключевым полям (до квартиры включительно).
 * Использует: region, area, city_or_settlement, street, house, и addressDetails.apartment
 */
export function compareDaDataAddresses(
  address1: DaDataAddressDataNormalized | null,
  addressDetails1: AddressDetailsComparable | null | undefined,
  address2: DaDataAddressDataNormalized | null,
  addressDetails2: AddressDetailsComparable | null | undefined,
): boolean {
  if (!address1 || !address2) {
    return false;
  }

  // Сравниваем ключевые поля адреса
  const fields1 = [
    normalizeText(address1.region),
    normalizeText(address1.area),
    normalizeText(address1.city_or_settlement),
    normalizeText(address1.street),
    normalizeText(address1.house),
    normalizePart(addressDetails1?.apartment),
  ];

  const fields2 = [
    normalizeText(address2.region),
    normalizeText(address2.area),
    normalizeText(address2.city_or_settlement),
    normalizeText(address2.street),
    normalizeText(address2.house),
    normalizePart(addressDetails2?.apartment),
  ];

  // Все поля должны совпадать
  return fields1.every((field, index) => field === fields2[index]);
}

