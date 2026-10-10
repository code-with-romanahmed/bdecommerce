// common/dto/pagination-query.dto.ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  // ?fields=id,name,slug — comma-separated। দিলে response-এ শুধু এই
  // ফিল্ডগুলোই থাকবে (payload ছোট হবে, mobile/slow-network-এর জন্য ভালো)।
  // না দিলে সব ফিল্ড আগের মতোই ফেরত যাবে।
  @IsOptional()
  @IsString()
  fields?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// "id,name,slug" স্ট্রিং থেকে ['id','name','slug'] — খালি/undefined হলে undefined,
// মানে "ফিল্টার করো না, সব ফিল্ড রাখো"।
export function parseFields(fields?: string): string[] | undefined {
  if (!fields) {
    return undefined;
  }

  const list = fields
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);

  return list.length > 0 ? list : undefined;
}

// row-লিস্টের প্রতিটা object থেকে শুধু দেওয়া fields-গুলো রেখে বাকি সব বাদ দেয়।
// fields undefined/খালি হলে row-গুলো অপরিবর্তিত থাকে।
export function pickFields<T extends Record<string, any>>(
  rows: T[],
  fields?: string[],
): Partial<T>[] | T[] {
  if (!fields || fields.length === 0) {
    return rows;
  }

  return rows.map((row) => {
    const picked: Partial<T> = {};
    for (const key of fields) {
      if (key in row) {
        picked[key as keyof T] = row[key];
      }
    }
    return picked;
  });
}