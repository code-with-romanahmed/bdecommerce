import {
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsPositive,
    IsString,
    MaxLength,
} from 'class-validator';

export class CreateCartDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  customerId?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  guestSessionId?: string;
}

export class AddCartItemDto {
  @IsInt()
  @IsPositive()
  productVariantId!: number;

  @IsInt()
  @IsPositive()
  quantity!: number;
}

export class UpdateCartItemDto {
  @IsInt()
  @IsPositive()
  quantity!: number;
}