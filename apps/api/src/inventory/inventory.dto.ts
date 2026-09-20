import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength
} from 'class-validator';

export class StockInDto {
  @IsInt()
  @IsPositive()
  branchId!: number;

  @IsInt()
  @IsPositive()
  productVariantId!: number;

  @IsInt()
  @IsPositive()
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  referenceType?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  referenceId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}


export class StockAdjustmentDto {
  @IsInt()
  @IsPositive()
  branchId!: number;

  @IsInt()
  @IsPositive()
  productVariantId!: number;

  @IsInt()
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
export class StockTransferDto {
  @IsInt()
  @IsPositive()
  fromBranchId!: number;

  @IsInt()
  @IsPositive()
  toBranchId!: number;

  @IsInt()
  @IsPositive()
  productVariantId!: number;

  @IsInt()
  @IsPositive()
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
export class StockOutDto extends StockInDto {}