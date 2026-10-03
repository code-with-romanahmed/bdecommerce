import {
  IsIn,
  IsInt,
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

export type PaymentMethodInput = (typeof PAYMENT_METHODS)[number];

export class CreateOrderDto {
  @IsInt()
  @IsPositive()
  customerId!: number;

  @IsInt()
  @IsPositive()
  addressId!: number;

  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  paymentMethod?: PaymentMethodInput;

  @IsOptional()
@IsIn(['FLAT', 'PERCENTAGE'])
discountType?: 'FLAT' | 'PERCENTAGE';

@IsOptional()
@IsPositive()
discountValue?: number;
}
export class CreatePaymentDto {
  @IsPositive()
  amount!: number;

  @IsIn(PAYMENT_METHODS)
  method!: PaymentMethodInput;

  @IsOptional()
  @IsString()
  transactionId?: string;
}

