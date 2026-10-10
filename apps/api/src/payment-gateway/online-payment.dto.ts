import { IsIn, IsNumber, IsOptional, IsPositive } from 'class-validator';

import { ONLINE_PROVIDERS, type OnlineProvider } from './payment-gateway.types.js';

export class InitiateOnlinePaymentDto {
  @IsIn(ONLINE_PROVIDERS)
  provider!: OnlineProvider;

  // ঐচ্ছিক আংশিক পরিমাণ। না দিলে order-এর বাকি পুরোটাই। সার্ভার যাচাই করে
  // (০ < amount ≤ বাকি), আর gateway থেকে নিশ্চিত হওয়া অঙ্কই রেকর্ড হয়।
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;
}