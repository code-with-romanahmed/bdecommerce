import {
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateProductVariantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  sku!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsNumberString(
    {},
    {
      message: 'price must be a valid decimal number',
    },
  )
  price!: string;
}