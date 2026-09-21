import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

const PAYMENT_METHODS = [
  'COD',
  'BKASH',
  'NAGAD',
  'ROCKET',
  'CARD',
  'OTHER',
] as const;

const PAYMENT_STATUSES = [
  'PENDING',
  'AUTHORIZED',
  'PAID',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;

export type PaymentMethodInput = (typeof PAYMENT_METHODS)[number];
export type PaymentStatusInput = (typeof PAYMENT_STATUSES)[number];

export class RecordPaymentDto {
  @IsIn(PAYMENT_METHODS)
  method!: PaymentMethodInput;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsString()
  transactionId?: string;

  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  status?: PaymentStatusInput;
}
