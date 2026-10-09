import {
    Injectable,
    Logger,
    type OnModuleDestroy,
    type OnModuleInit,
} from '@nestjs/common';

import { OnlinePaymentService } from './online-payment.service.js';
import { PaymentIntentStore } from './payment-intent.store.js';

// এর চেয়ে কম বয়সী চেষ্টা ধরা হয় না (গ্রাহক হয়তো এখনো bKash পাতায়)
const MIN_AGE_SECONDS = 3 * 60;
// এর বেশি পুরনো ও অসম্পূর্ণ চেষ্টা বন্ধ (EXPIRED)
const EXPIRY_SECONDS = 24 * 60 * 60;
const BATCH_SIZE = 200;

/**
 * নির্দিষ্ট সময় পরপর আটকে-থাকা (INITIATED) পেমেন্টগুলো gateway-র কাছে যাচাই করে।
 *
 * কেন দরকার: callback কখনো না-ও আসতে পারে (গ্রাহক ব্রাউজার বন্ধ করেছে, নেটওয়ার্ক
 * গেছে, বা execute-এর পর আমাদের সার্ভার ক্র্যাশ করেছে)। তখন টাকা কাটা কিন্তু
 * order paid হয়নি — এই job সেটা সামলায়।
 *
 * ENV: PAYMENT_RECONCILE_INTERVAL_SECONDS (ডিফল্ট 120; 0 দিলে বন্ধ)
 * একাধিক সার্ভার চললে Redis lock-এর কারণে একসময়ে একটাই চালায়।
 */
@Injectable()
export class PaymentReconciliationService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PaymentReconciliationService.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(
    private readonly store: PaymentIntentStore,
    private readonly onlinePayments: OnlinePaymentService,
  ) {}

  onModuleInit(): void {
    const seconds = Number(
      process.env.PAYMENT_RECONCILE_INTERVAL_SECONDS ?? 120,
    );

    if (!Number.isFinite(seconds) || seconds <= 0) {
      this.logger.log('Payment reconciliation is disabled');
      return;
    }

    this.timer = setInterval(() => {
      void this.run(seconds);
    }, seconds * 1000);

    // এই timer একা প্রক্রিয়াকে বাঁচিয়ে রাখবে না
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async run(
    intervalSeconds = 120,
  ): Promise<{ checked: number; recorded: number; expired: number } | null> {
    if (this.running) return null;

    this.running = true;

    try {
      // lock-এর মেয়াদ interval-এর চেয়ে সামান্য কম: পরের tick-এ আবার চলতে পারে,
      // কিন্তু একই tick-এ দুই সার্ভারে নয়
      const ttl = Math.max(intervalSeconds - 5, 10);

      if (!(await this.store.acquireReconcileLock(ttl))) {
        return null;
      }

      const stale = await this.store.listStaleInitiated(
        MIN_AGE_SECONDS,
        BATCH_SIZE,
      );

      let recorded = 0;
      let expired = 0;

      for (const { intent, ageSeconds } of stale) {
        try {
          const outcome = await this.onlinePayments.reconcile(intent);

          if (outcome === 'success') {
            recorded++;
          } else if (outcome === 'pending' && ageSeconds > EXPIRY_SECONDS) {
            await this.onlinePayments.expire(intent);
            expired++;
          }
        } catch (error) {
          this.logger.error(
            `Reconcile failed for intent ${intent.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      if (stale.length > 0) {
        this.logger.log(
          `Reconciled ${stale.length} stale payment(s): ${recorded} recorded, ${expired} expired`,
        );
      }

      return { checked: stale.length, recorded, expired };
    } finally {
      this.running = false;
    }
  }
}