import { SetMetadata } from '@nestjs/common';

export interface RateLimitRule {
  // Redis key-এর অংশ; প্রতিটি route/নিয়মের জন্য আলাদা নাম দিন
  name: string;
  // window-র মধ্যে সর্বোচ্চ কতটি রিকোয়েস্ট
  limit: number;
  // window কত সেকেন্ডের
  windowSeconds: number;
  // কার ভিত্তিতে গোনা হবে: client IP, না লগইন করা ইউজার।
  // 'user' ব্যবহার করলে এই guard-এর আগে JwtAuthGuard চালাতে হবে
  // (না চালালে IP-তে ফিরে যায়)।
  by: 'ip' | 'user';
}

export const RATE_LIMIT_KEY = 'rate_limit_rules';

export const RateLimit = (...rules: RateLimitRule[]) =>
  SetMetadata(RATE_LIMIT_KEY, rules);