import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { RedisService } from '../redis/redis.service.js';
import paymentGatewayConfig from './payment-gateway.config.js';
import type { OnlineProvider } from './payment-gateway.types.js';

export type IntentStatus =
  | 'INITIATED'
  | 'COMPLETED'
  | 'FAILED'
  | 'NEEDS_REVIEW'; // টাকা এসেছে কিন্তু সিস্টেমে রেকর্ড করা যায়নি → হাতে মেলাতে হবে

export interface PaymentIntent {
  id: string;
  provider: OnlineProvider;
  organizationId: number;
  orderId: number;
  userId: number;
  customerId: number | null;
  // আমাদের হিসাব-করা পরিমাণ; gateway-র সাড়া এর সাথে মিলতে হবে
  amount: string;
  currency: 'BDT';
  invoiceNumber: string;
  gatewayPaymentId: string;
  redirectUrl: string;
  status: IntentStatus;
  transactionId?: string;
  createdAt: string;
}

const COMPLETED_TTL_SECONDS = 7 * 24 * 60 * 60;
const ORDER_SLOT_TTL_SECONDS = 15 * 60;
const FINALIZE_LOCK_TTL_SECONDS = 120;

/**
 * Redis-ভিত্তিক intent store।
 *
 * ⚠ প্রোডাকশন-সীমা: Redis মেমরি-ডেটাবেস; flush/ক্র্যাশে pending intent হারাতে
 * পারে। টাকার ক্ষেত্রে আদর্শ হলো একটা PaymentIntent টেবিল (Postgres)। এই
 * ক্লাসের ইন্টারফেস ওভাবেই রাখা হয়েছে যাতে পরে শুধু ভেতরটা বদলালেই হয়।
 */
@Injectable()
export class PaymentIntentStore {
  constructor(
    private readonly redisService: RedisService,
    @Inject(paymentGatewayConfig.KEY)
    private readonly config: ConfigType<typeof paymentGatewayConfig>,
  ) {}

  private get redis() {
    return this.redisService.getClient();
  }

  private intentKey = (id: string) => `pay:intent:${id}`;
  private gatewayKey = (provider: OnlineProvider, gatewayPaymentId: string) =>
    `pay:gw:${provider}:${gatewayPaymentId}`;
  private slotKey = (orderId: number) => `pay:order-active:${orderId}`;
  private lockKey = (id: string) => `pay:finalize:${id}`;

  async create(intent: PaymentIntent): Promise<void> {
    const ttl = this.config.intentTtlSeconds;

    await this.redis
      .multi()
      .set(this.intentKey(intent.id), JSON.stringify(intent), 'EX', ttl)
      .set(
        this.gatewayKey(intent.provider, intent.gatewayPaymentId),
        intent.id,
        'EX',
        ttl,
      )
      .exec();
  }

  async get(id: string): Promise<PaymentIntent | null> {
    const raw = await this.redis.get(this.intentKey(id));

    if (!raw) return null;

    try {
      return JSON.parse(raw) as PaymentIntent;
    } catch {
      return null;
    }
  }

  async findByGatewayPaymentId(
    provider: OnlineProvider,
    gatewayPaymentId: string,
  ): Promise<PaymentIntent | null> {
    const id = await this.redis.get(this.gatewayKey(provider, gatewayPaymentId));

    return id ? this.get(id) : null;
  }

  async setStatus(
    intent: PaymentIntent,
    status: IntentStatus,
    extra?: { transactionId?: string },
  ): Promise<PaymentIntent> {
    const updated: PaymentIntent = { ...intent, status, ...extra };
    const ttl =
      status === 'COMPLETED' || status === 'NEEDS_REVIEW'
        ? COMPLETED_TTL_SECONDS
        : this.config.intentTtlSeconds;

    await this.redis
      .multi()
      .set(this.intentKey(intent.id), JSON.stringify(updated), 'EX', ttl)
      .expire(this.gatewayKey(intent.provider, intent.gatewayPaymentId), ttl)
      .exec();

    return updated;
  }

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
}