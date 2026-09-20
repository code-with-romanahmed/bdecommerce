import {
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  slug!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  categoryId?: number;
}