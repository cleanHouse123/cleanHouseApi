import {
  IsString,
  IsNumber,
  IsEmail,
  IsOptional,
  IsArray,
  ValidateNested,
  IsEnum,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CurrencyEnum } from 'nestjs-yookassa';
import { VatCodesEnum } from 'nestjs-yookassa/dist/interfaces/receipt-details.interface';

export enum PaymentSubject {
  COMMODITY = 'commodity',
  EXCISE = 'excise',
  JOB = 'job',
  SERVICE = 'service',
  GAMBLING_BET = 'gambling_bet',
  GAMBLING_PRIZE = 'gambling_prize',
  LOTTERY = 'lottery',
  LOTTERY_PRIZE = 'lottery_prize',
  INTELLECTUAL_ACTIVITY = 'intellectual_activity',
  PAYMENT = 'payment',
  AGENT_COMMISSION = 'agent_commission',
  COMPOSITE = 'composite',
  ANOTHER = 'another',
  PROPERTY_RIGHT = 'property_right',
  NON_OPERATING_GAIN = 'non_operating_gain',
  INSURANCE_PREMIUM = 'insurance_premium',
  SALES_TAX = 'sales_tax',
  RESORT_FEE = 'resort_fee',
  DEPOSIT = 'deposit',
  MARKED = 'marked',
}

export enum PaymentMode {
  FULL_PREPAYMENT = 'full_prepayment',
  PARTIAL_PREPAYMENT = 'partial_prepayment',
  ADVANCE = 'advance',
  FULL_PAYMENT = 'full_payment',
  PARTIAL_PAYMENT = 'partial_payment',
  CREDIT = 'credit',
  CREDIT_PAYMENT = 'credit_payment',
}

export enum SettlementType {
  CASHLESS = 'cashless',
  PREPAYMENT = 'prepayment',
  POSTPAYMENT = 'postpayment',
  CONSIDERATION = 'consideration',
}

export class AmountDto {
  @IsNumber()
  value: number;

  @IsEnum(CurrencyEnum)
  currency: CurrencyEnum;
}

export class ReceiptItemDto {
  @IsString()
  description: string;

  @IsNumber()
  @Min(0.001)
  @Max(99999.999)
  quantity: number;

  @ValidateNested()
  @Type(() => AmountDto)
  amount: AmountDto;

  @IsEnum(VatCodesEnum)
  vat_code: VatCodesEnum;

  @IsEnum(PaymentSubject)
  payment_subject: PaymentSubject;

  @IsEnum(PaymentMode)
  payment_mode: PaymentMode;

  @IsOptional()
  @IsString()
  measure?: string;

  @IsOptional()
  @IsString()
  mark_mode?: string;

  @IsOptional()
  mark_code_info?: {
    gs_1m?: string;
  };
}

export class CustomerDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class SettlementDto {
  @IsEnum(SettlementType)
  type: SettlementType;

  @ValidateNested()
  @Type(() => AmountDto)
  amount: AmountDto;
}

export class ReceiptDto {
  @ValidateNested()
  @Type(() => CustomerDto)
  customer: CustomerDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiptItemDto)
  items: ReceiptItemDto[];

  @IsOptional()
  @IsBoolean()
  send?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SettlementDto)
  settlements?: SettlementDto[];

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  payment_id?: string;
}
