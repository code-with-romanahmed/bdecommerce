import { Injectable } from '@nestjs/common';
import type { Numeric } from '@prisma/orm-postgres/target/codec-types';

import { db } from '../prisma/db.js';
import { RedisService } from '../redis/redis.service.js';
import type { OnlineProvider } from './payment-gateway.types.js';

export type IntentStatus =
  | 'INITIATED'
  | 'COMPLETED'
  | 'FAILED'
  | 'NEEDS_REVIEW'; // টাকা এসেছে কিন্তু সিস্টেমে রেকর্ড করা যায়নি → হাতে মেলাতে হবে

export interface PaymentIntent {
  // বাইরে প্রকাশযোগ্য id (uuid) — DB-র আসল Int id নয়
  id: string;
  provider: OnlineProvider;
  organizationId: number;
  orderId: number;
  userId: number;
  customerId: number | null;
  // আমাদের হিসাব-করা পরিমাণ ("700.00"); gateway-র সাড়া এর সাথে মিলতে হবে
  amount: string;
  currency: 'BDT';
  invoiceNumber: string;
  gatewayPaymentId: string;
  redirectUrl: string;
  status: IntentStatus;
  transactionId?: string;
  failureReason?: string;
  createdAt: string;
}

const ORDER_SLOT_TTL_SECONDS = 15 * 60;
const FINALIZE_LOCK_TTL_SECONDS = 120;

const money = (value: string | number): Numeric<12, 2> =>
  Number(value).toFixed(2) as Numeric<12, 2>;

function toIntent(row: any): PaymentIntent {
  return {
    id: row.publicId,
    provider: row.provider as OnlineProvider,
    organizationId: row.organizationId,
    orderId: row.orderId,
    userId: row.userId,
    customerId: row.customerId ?? null,
    amount: Number(row.amount).toFixed(2), // "700" ও "700.00" দুটোই এক ফরম্যাটে
    currency: 'BDT',
    invoiceNumber: row.invoiceNumber,
    gatewayPaymentId: row.gatewayPaymentId,
    redirectUrl: row.redirectUrl,
    status: row.status as IntentStatus,
    transactionId: row.transactionId ?? undefined,
    failureReason: row.failureReason ?? undefined,
    createdAt: String(row.createdAt),
  };
}

/**
 * PaymentIntent-এর স্থায়ী রেকর্ড Postgres-এ (Redis ফ্লাশ হলেও হারায় না)।
 * Redis থাকে শুধু অস্থায়ী সমন্বয়ে: finalize lock, order-slot, reconcile lock।
 *
 * স্ট্যাটাস বদল compare-and-set: `where({ publicId, status: <যা পড়েছি> })`।
 * তাই দুটো প্রক্রিয়া একসাথে বদলাতে চাইলে একটাই জেতে, আর COMPLETED
 * কখনো পুরনো (stale) তথ্যের ভিত্তিতে উল্টে যেতে পারে না।
 */
@Injectable()
export class PaymentIntentStore {
  constructor(private readonly redisService: RedisService) {}

  private get redis() {
    return this.redisService.getClient();
  }

  private slotKey = (orderId: number) => `pay:order-active:${orderId}`;
  private lockKey = (id: string) => `pay:finalize:${id}`;

  // ------------------------------------------------------------------ DB

  async create(intent: PaymentIntent): Promise<void> {
    await db.orm.public.PaymentIntent.create({
      publicId: intent.id,
      organizationId: intent.organizationId,
      orderId: intent.orderId,
      userId: intent.userId,
      customerId: intent.customerId ?? undefined,
      provider: intent.provider,
      amount: money(intent.amount),
      currency: intent.currency,
      invoiceNumber: intent.invoiceNumber,
      gatewayPaymentId: intent.gatewayPaymentId,
      redirectUrl: intent.redirectUrl,
      status: intent.status,
    });
  }

  async get(id: string): Promise<PaymentIntent | null> {
    const row = await db.orm.public.PaymentIntent
      .where({ publicId: id })
      .first();

    return row ? toIntent(row) : null;
  }

  async findByGatewayPaymentId(
    provider: OnlineProvider,
    gatewayPaymentId: string,
  ): Promise<PaymentIntent | null> {
    const row = await db.orm.public.PaymentIntent
      .where({ provider, gatewayPaymentId })
      .first();

    return row ? toIntent(row) : null;
  }

  /**
   * অবস্থা বদলায় শুধু যদি DB-তে এখনো `intent.status`-ই থাকে (compare-and-set)।
   * অন্য কেউ আগে বদলে ফেললে কিছু লেখা হয় না এবং বর্তমান রেকর্ড ফেরত আসে।
   */
  async setStatus(
    intent: PaymentIntent,
    status: IntentStatus,
    extra?: { transactionId?: string; failureReason?: string },
  ): Promise<PaymentIntent> {
    const data: Record<string, unknown> = { status };

    if (extra?.transactionId !== undefined) {
      data.transactionId = extra.transactionId;
    }

    if (extra?.failureReason !== undefined) {
      data.failureReason = extra.failureReason.slice(0, 500);
    }

    const updated = await db.orm.public.PaymentIntent
      .where({ publicId: intent.id, status: intent.status })
      .update(data as any);

    if (!updated) {
      return (await this.get(intent.id)) ?? intent;
    }

    return { ...intent, status, ...extra };
  }

  async listByStatus(
    organizationId: number,
    status: IntentStatus,
    limit: number,
  ): Promise<PaymentIntent[]> {
    const rows = await db.orm.public.PaymentIntent
      .where({ organizationId, status })
      .orderBy((p) => p.id.asc())
      .limit(limit)
      .all();

    return rows.map(toIntent);
  }

  // INITIATED থাকা পুরনো চেষ্টা (সবচেয়ে পুরনো আগে)। সংখ্যা সীমিত — শেষ হওয়া
  // সবকিছু INITIATED থেকে বেরিয়ে যায়, তাই এই সেট বাড়তে থাকে না।
  async listStaleInitiated(
    minAgeSeconds: number,
    limit: number,
  ): Promise<{ intent: PaymentIntent; ageSeconds: number }[]> {
    const rows = await db.orm.public.PaymentIntent
      .where({ status: 'INITIATED' })
      .orderBy((p) => p.id.asc())
      .limit(limit)
      .all();

    const now = Date.now();

    return rows
      .map((row: any) => ({
        intent: toIntent(row),
        ageSeconds: (now - new Date(String(row.createdAt)).getTime()) / 1000,
      }))
      .filter((entry) => entry.ageSeconds >= minAgeSeconds);
  }

  // ------------------------------------------------------------------ Redis (অস্থায়ী সমন্বয়)

  // প্রতি order-এ একসময়ে একটাই সক্রিয় চেষ্টা। দখল পেলে null; না পেলে
  // বর্তমান দখলদার intent-এর id ফেরত।
  async tryAcquireOrderSlot(
    orderId: number,
    intentId: string,
  ): Promise<string | null> {
    const result = await this.redis.set(
      this.slotKey(orderId),
      intentId,
      'EX',
      ORDER_SLOT_TTL_SECONDS,
      'NX',
    );

    if (result === 'OK') return null;

    return (await this.redis.get(this.slotKey(orderId))) ?? null;
  }

  async releaseOrderSlot(orderId: number): Promise<void> {
    await this.redis.del(this.slotKey(orderId));
  }

  async acquireFinalizeLock(id: string): Promise<boolean> {
    const result = await this.redis.set(
      this.lockKey(id),
      '1',
      'EX',
      FINALIZE_LOCK_TTL_SECONDS,
      'NX',
    );

    return result === 'OK';
  }

  async releaseFinalizeLock(id: string): Promise<void> {
    await this.redis.del(this.lockKey(id));
  }

  // একাধিক সার্ভার চললে শুধু একটাই reconciliation চালাবে
  async acquireReconcileLock(ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.set(
      'pay:reconcile:lock',
      '1',
      'EX',
      ttlSeconds,
      'NX',
    );

    return result === 'OK';
  }
}