import { randomUUID } from 'node:crypto';

import {
    BadRequestException,
    ConflictException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import type { AuthUser } from '../auth/auth.types.js';
import { OrderService } from '../order/order.service.js';
import { db } from '../prisma/db.js';
import { BkashGateway } from './bkash.gateway.js';
import { NagadGateway } from './nagad.gateway.js';
import paymentGatewayConfig from './payment-gateway.config.js';
import type {
    OnlineProvider,
    PaymentGateway,
    VerifyMode,
} from './payment-gateway.types.js';
import { PaymentIntentStore, type PaymentIntent } from './payment-intent.store.js';

export type PaymentOutcome = 'success' | 'failed' | 'pending' | 'review';

export interface InitiateResult {
  intentId: string;
  provider: OnlineProvider;
  amount: string;
  currency: 'BDT';
  redirectUrl: string;
}

const sameMoney = (a: string, b: string) =>
  Math.abs(Number(a) - Number(b)) < 0.005;

/**
 * অনলাইন পেমেন্টের নিরাপত্তা-নিয়ম (এই ফাইলের মূল কথা):
 *
 *  1. পরিমাণ সবসময় সার্ভার হিসাব করে (order-এর বাকি টাকা)। ক্লায়েন্ট শুধু
 *     "কম দিতে চাই" বলতে পারে, বেশি নয়।
 *  2. ব্রাউজারের callback-এর status/অন্য কোনো query কখনো প্রমাণ নয়। সার্ভার
 *     নিজে gateway-কে জিজ্ঞেস করে (execute/query)।
 *  3. gateway-র সাড়ার paymentID, invoice, amount, currency আমাদের intent-এর
 *     সাথে হুবহু না মিললে কিছু রেকর্ড হয় না (NEEDS_REVIEW)।
 *  4. রেকর্ড হয় আগে থেকে থাকা OrderService.createPayment দিয়ে — যেখানে
 *     transaction, overpayment-সুরক্ষা ও transactionId-ইউনিক চেক আছে।
 *  5. Idempotent: callback/webhook বারবার এলেও একবারই রেকর্ড হয় (lock + status
 *     + transactionId চেক)।
 */
@Injectable()
export class OnlinePaymentService {
  private readonly logger = new Logger(OnlinePaymentService.name);
  private readonly gateways: Record<OnlineProvider, PaymentGateway>;

  constructor(
    bkash: BkashGateway,
    nagad: NagadGateway,
    private readonly store: PaymentIntentStore,
    private readonly orderService: OrderService,
    @Inject(paymentGatewayConfig.KEY)
    private readonly config: ConfigType<typeof paymentGatewayConfig>,
  ) {
    this.gateways = { BKASH: bkash, NAGAD: nagad };
  }

  // ------------------------------------------------------------------ initiate

  // কল করার আগে controller-এ JwtAuth + payment.create + OrderAccessGuard
  // চলে গেছে, অর্থাৎ ইউজার এই order-এ access রাখে (customer হলে নিজের order)।
  async initiate(
    user: AuthUser,
    orderId: number,
    provider: OnlineProvider,
    requestedAmount?: number,
  ): Promise<InitiateResult> {
    if (!this.config.publicApiUrl || !this.config.frontendUrl) {
      throw new ServiceUnavailableException('Online payments are not configured');
    }

    const order = await db.orm.public.Order
      .where({ id: orderId, organizationId: user.organizationId })
      .first();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === 'CANCELLED') {
      throw new BadRequestException('Cannot pay for a cancelled order');
    }

    const remaining = await this.remainingAmount(
      order.id,
      Number(order.grandTotal),
    );

    if (remaining < 0.01) {
      throw new BadRequestException('Order is already fully paid');
    }

    let amount = remaining;

    if (requestedAmount !== undefined) {
      if (requestedAmount <= 0 || requestedAmount > remaining + 0.001) {
        throw new BadRequestException(
          `Amount must be between 0.01 and the remaining balance (${remaining.toFixed(2)})`,
        );
      }

      amount = requestedAmount;
    }

    const amountText = amount.toFixed(2);
    const intentId = randomUUID();

    // একই order-এ একসাথে একটাই সক্রিয় চেষ্টা
    const holder = await this.store.tryAcquireOrderSlot(order.id, intentId);

    if (holder !== null) {
      const existing = await this.store.get(holder);

      if (
        existing &&
        existing.status === 'INITIATED' &&
        existing.provider === provider &&
        existing.amount === amountText &&
        existing.userId === user.id
      ) {
        return this.toResult(existing); // একই চেষ্টা আবার — আগেরটাই ফেরত
      }

      await this.store.releaseOrderSlot(order.id);

      if ((await this.store.tryAcquireOrderSlot(order.id, intentId)) !== null) {
        throw new ConflictException(
          'Another payment is already in progress for this order',
        );
      }
    }

    try {
      const created = await this.gateways[provider].createPayment({
        amount: amountText,
        invoiceNumber: `${order.orderNumber}-${intentId.slice(0, 8)}`,
        payerReference: String(order.customerId ?? order.id),
        callbackUrl: `${this.config.publicApiUrl}/payments/callback/${provider.toLowerCase()}`,
      });

      const intent: PaymentIntent = {
        id: intentId,
        provider,
        organizationId: user.organizationId,
        orderId: order.id,
        userId: user.id,
        customerId: order.customerId ?? null,
        amount: amountText,
        currency: 'BDT',
        invoiceNumber: `${order.orderNumber}-${intentId.slice(0, 8)}`,
        gatewayPaymentId: created.gatewayPaymentId,
        redirectUrl: created.redirectUrl,
        status: 'INITIATED',
        createdAt: new Date().toISOString(),
      };

      await this.store.create(intent);

      return this.toResult(intent);
    } catch (error) {
      await this.store.releaseOrderSlot(order.id);
      throw error;
    }
  }

  // ------------------------------------------------------------------ inbound

  // গ্রাহকের ব্রাউজার gateway থেকে ফিরলে। ফেরত দেয় ফ্রন্টএন্ডের redirect URL।
  async handleCallback(
    provider: OnlineProvider,
    query: Record<string, unknown>,
  ): Promise<string> {
    const gateway = this.gateways[provider];
    const parsed = gateway.parseCallback(query);

    if (!parsed) {
      return this.resultUrl(undefined, 'invalid');
    }

    const intent = await this.store.findByGatewayPaymentId(
      provider,
      parsed.gatewayPaymentId,
    );

    if (!intent) {
      return this.resultUrl(undefined, 'unknown');
    }

    // status শুধু ইঙ্গিত: "success" হলে চূড়ান্ত করার চেষ্টা (execute),
    // নইলে শুধু অবস্থা জিজ্ঞেস। কোনো ক্ষেত্রেই status নিজে state বদলায় না।
    const hint = parsed.hintStatus?.trim().toLowerCase();
    const mode: VerifyMode = hint === 'success' ? 'EXECUTE' : 'QUERY';

    const outcome = await this.verifyAndFinalize(intent, mode);

    return this.resultUrl(intent.orderId, outcome);
  }

  // gateway-র সার্ভার-notification। বডি বিশ্বাস করা হয় না; শুধু payment id
  // নিয়ে নিজে gateway-কে জিজ্ঞেস করি (QUERY — কিছু বদলায় না)।
  async handleWebhook(provider: OnlineProvider, payload: unknown): Promise<void> {
    const gatewayPaymentId =
      this.gateways[provider].extractPaymentIdFromNotification(payload);

    if (!gatewayPaymentId) return;

    const intent = await this.store.findByGatewayPaymentId(
      provider,
      gatewayPaymentId,
    );

    if (!intent) return;

    await this.verifyAndFinalize(intent, 'QUERY');
  }

  // ------------------------------------------------------------------ core

  private async verifyAndFinalize(
    intent: PaymentIntent,
    mode: VerifyMode,
  ): Promise<PaymentOutcome> {
    if (intent.status === 'COMPLETED') return 'success';
    if (intent.status === 'NEEDS_REVIEW') return 'review';

    let result;

    try {
      result = await this.gateways[intent.provider].verifyPayment(
        intent.gatewayPaymentId,
        mode,
      );
    } catch (error) {
      // gateway-তে পৌঁছানো যায়নি — অবস্থা না বদলে পরে আবার চেষ্টা হবে
      this.logger.warn(
        `Verification unavailable for intent ${intent.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return 'pending';
    }

    if (result.kind === 'PENDING') {
      return 'pending';
    }

    if (result.kind === 'FAILED') {
      // FAILED চূড়ান্ত নয়: পরে সফল যাচাই এলে সেটাই জেতে (COMPLETED-ই শুধু চূড়ান্ত)
      if (intent.status !== 'FAILED') {
        await this.store.setStatus(intent, 'FAILED');
      }

      await this.store.releaseOrderSlot(intent.orderId);

      return 'failed';
    }

    // ---- COMPLETED: gateway-র প্রতিটি তথ্য আমাদের নিজস্ব রেকর্ডের সাথে মেলাও ----
    const matches =
      result.gatewayPaymentId === intent.gatewayPaymentId &&
      result.invoiceNumber === intent.invoiceNumber &&
      result.currency === intent.currency &&
      sameMoney(result.amount, intent.amount);

    if (!matches) {
      this.logger.error(
        `PAYMENT MISMATCH intent=${intent.id} order=${intent.orderId} ` +
          `expected=${intent.amount} ${intent.currency} invoice=${intent.invoiceNumber} ` +
          `got=${result.amount} ${result.currency} invoice=${result.invoiceNumber} ` +
          `trx=${result.transactionId}`,
      );

      await this.store.setStatus(intent, 'NEEDS_REVIEW', {
        transactionId: result.transactionId,
      });

      return 'review';
    }

    if (!(await this.store.acquireFinalizeLock(intent.id))) {
      return 'pending'; // একই মুহূর্তে আরেকটা রিকোয়েস্ট এটা সামলাচ্ছে
    }

    try {
      const fresh = await this.store.get(intent.id);

      if (fresh?.status === 'COMPLETED') return 'success';

      // আগের কোনো চেষ্টা রেকর্ড করে ক্র্যাশ করে থাকলে (idempotency)
      const already = await db.orm.public.Payment
        .where({
          organizationId: intent.organizationId,
          transactionId: result.transactionId,
        })
        .first();

      if (already) {
        if (already.orderId !== intent.orderId) {
          this.logger.error(
            `TRANSACTION ID REUSED trx=${result.transactionId} ` +
              `intent=${intent.id} order=${intent.orderId} existingOrder=${already.orderId}`,
          );
          await this.store.setStatus(intent, 'NEEDS_REVIEW', {
            transactionId: result.transactionId,
          });
          return 'review';
        }
      } else {
        try {
          await this.orderService.createPayment(
            intent.organizationId,
            intent.orderId,
            {
              amount: Number(intent.amount),
              method: intent.provider,
              transactionId: result.transactionId,
            },
          );
        } catch (error) {
          // টাকা কাটা হয়ে গেছে কিন্তু রেকর্ড হয়নি (যেমন এর মধ্যে order cancel বা
          // কাউন্টারে নগদ নেওয়া হয়ে overpayment) — হাতে মেলাতে হবে।
          this.logger.error(
            `MONEY RECEIVED BUT NOT RECORDED intent=${intent.id} order=${intent.orderId} ` +
              `trx=${result.transactionId} amount=${intent.amount} reason=${
                error instanceof Error ? error.message : String(error)
              }`,
          );

          await this.store.setStatus(intent, 'NEEDS_REVIEW', {
            transactionId: result.transactionId,
          });

          return 'review';
        }
      }

      await this.store.setStatus(intent, 'COMPLETED', {
        transactionId: result.transactionId,
      });
      await this.store.releaseOrderSlot(intent.orderId);

      return 'success';
    } finally {
      await this.store.releaseFinalizeLock(intent.id);
    }
  }

  // ------------------------------------------------------------------ helpers

  private async remainingAmount(
    orderId: number,
    orderTotal: number,
  ): Promise<number> {
    const payments = await db.orm.public.Payment.where({ orderId }).all();

    const paid = payments
      .filter((p) => p.status === 'PAID' || p.status === 'AUTHORIZED')
      .reduce((sum, p) => sum + Number(p.amount), 0);

    return orderTotal - paid;
  }

  private toResult(intent: PaymentIntent): InitiateResult {
    return {
      intentId: intent.id,
      provider: intent.provider,
      amount: intent.amount,
      currency: intent.currency,
      redirectUrl: intent.redirectUrl,
    };
  }

  private resultUrl(orderId: number | undefined, status: string): string {
    const base = this.config.frontendUrl;

    return orderId === undefined
      ? `${base}/payment-result?status=${status}`
      : `${base}/orders/${orderId}/payment-result?status=${status}`;
  }
}