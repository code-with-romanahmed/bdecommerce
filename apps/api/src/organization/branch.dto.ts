import {
    IsIn,
    IsNotEmpty,
    IsString,
    MaxLength,
} from 'class-validator';

export class CreateBranchDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  @IsIn(['STORE', 'WAREHOUSE', 'OFFICE'])
  type!: 'STORE' | 'WAREHOUSE' | 'OFFICE';
}