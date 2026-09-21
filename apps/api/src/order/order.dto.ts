import {
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
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
}
