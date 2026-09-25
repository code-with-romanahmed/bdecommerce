import { IsInt, IsPositive } from 'class-validator';

export class StartCashierAssignmentDto {
  @IsInt()
  @IsPositive()
  customerId!: number;
}
