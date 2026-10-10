import {
    BadGatewayException,
    Inject,
    Injectable,
    Logger,
    ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import paymentGatewayConfig from './payment-gateway.config.js';
import type {
    GatewayCreateInput,
    GatewayCreateResult,
    GatewayVerifyResult,
    ParsedCallback,
    PaymentGateway,
    VerifyMode,
} from './payment-gateway.types.js';

type Json = Record<string, any>;

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * bKash Tokenized Checkout (v1.2.0-beta) adapter।
 *
 * ফ্লো: grant token → create (গ্রাহক bkashURL-এ যায়) → callback →
 * execute → (দরকারে) payment status query।
 *
 * ⚠ endpoint পথ ও ফিল্ড নাম bKash-এর পাবলিক ডক ও কমিউনিটি ক্লায়েন্টের
 * সাথে মিলিয়ে লেখা; আপনার merchant অ্যাকাউন্টের ডক/sandbox-এ একবার
 * যাচাই করে নিন (ভার্সন বা অ্যাকাউন্ট-ভেদে ছোট পার্থক্য থাকতে পারে)।
 */
@Injectable()
export class BkashGateway implements PaymentGateway {
  readonly provider = 'BKASH' as const;

  private readonly logger = new Logger(BkashGateway.name);
  private token: { value: string; expiresAt: number } | null = null;
  private tokenRequest: Promise<string> | null = null;

  constructor(
    @Inject(paymentGatewayConfig.KEY)
    private readonly config: ConfigType<typeof paymentGatewayConfig>,
  ) {}

  // ------------------------------------------------------------------ HTTP

  private assertConfigured(): void {
    const { appKey, appSecret, username, password } = this.config.bkash;

    if (!appKey || !appSecret || !username || !password) {
      throw new ServiceUnavailableException(
        'bKash is not configured on this server',
      );
    }
  }

  private async request(
    path: string,
    body: unknown,
    headers: Record<string, string>,
  ): Promise<Json> {
    let response: Response;

    try {
      response = await fetch(`${this.config.bkash.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...headers,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(
        `bKash request failed (${path}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BadGatewayException('Payment provider is unreachable');
    }

    let data: Json = {};

    try {
      data = (await response.json()) as Json;
    } catch {
      data = {};
    }

    if (!response.ok) {
      // secret/টোকেন কখনো লগে নয়; শুধু পথ ও status
      this.logger.error(`bKash HTTP ${response.status} on ${path}`);
      throw new BadGatewayException('Payment provider returned an error');
    }

    return data;
  }

  // ------------------------------------------------------------------ token

  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) {
      return this.token.value;
    }

    // একসাথে অনেক রিকোয়েস্ট এলে grant একবারই হবে
    if (!this.tokenRequest) {
      this.tokenRequest = this.grantToken().finally(() => {
        this.tokenRequest = null;
      });
    }

    return this.tokenRequest;
  }

  private async grantToken(): Promise<string> {
    this.assertConfigured();

    const { appKey, appSecret, username, password } = this.config.bkash;

    const data = await this.request(
      '/checkout/token/grant',
      { app_key: appKey, app_secret: appSecret },
      { username, password },
    );

    if (data.statusCode !== '0000' || typeof data.id_token !== 'string') {
      this.logger.error(
        `bKash token grant failed: ${data.statusCode} ${data.statusMessage}`,
      );
      throw new BadGatewayException('Payment provider authentication failed');
    }

    const ttl = Number(data.expires_in) > 0 ? Number(data.expires_in) : 3600;

    this.token = {
      value: data.id_token,
      expiresAt: Date.now() + ttl * 1000,
    };

    return data.id_token;
  }

  private async authedPost(path: string, body: unknown): Promise<Json> {
    const token = await this.getToken();

    return this.request(path, body, {
      Authorization: token, // "Bearer" ছাড়া, bKash-এর নিয়ম
      'X-APP-Key': this.config.bkash.appKey,
    });
  }

  // ------------------------------------------------------------------ API

  async createPayment(input: GatewayCreateInput): Promise<GatewayCreateResult> {
    const data = await this.authedPost('/checkout/create', {
      mode: '0011',
      payerReference: input.payerReference,
      callbackURL: input.callbackUrl,
      amount: input.amount,
      currency: 'BDT',
      intent: 'sale',
      merchantInvoiceNumber: input.invoiceNumber,
    });

    if (data.statusCode !== '0000' || !data.paymentID || !data.bkashURL) {
      this.logger.error(
        `bKash create failed: ${data.statusCode} ${data.statusMessage}`,
      );
      throw new BadGatewayException('Could not start the payment');
    }

    // gateway-র দেওয়া URL-এও আমরা শুধু https মানি
    let url: URL;
    try {
      url = new URL(String(data.bkashURL));
    } catch {
      throw new BadGatewayException('Could not start the payment');
    }

    if (url.protocol !== 'https:') {
      throw new BadGatewayException('Could not start the payment');
    }

    return {
      gatewayPaymentId: String(data.paymentID),
      redirectUrl: url.toString(),
    };
  }

  async verifyPayment(
    gatewayPaymentId: string,
    mode: VerifyMode,
  ): Promise<GatewayVerifyResult> {
    let data: Json | null = null;

    if (mode === 'EXECUTE') {
      try {
        data = await this.authedPost('/checkout/execute', {
          paymentID: gatewayPaymentId,
        });
      } catch {
        data = null; // timeout/নেটওয়ার্ক: নিচে query দিয়ে সত্যটা জেনে নেব
      }
    }

    // execute সফল না হলে (বা QUERY মোডে) বর্তমান অবস্থা জিজ্ঞেস করি।
    // এতে double-execute ও timeout-এর পরের অবস্থাও ঠিকভাবে ধরা পড়ে।
    if (!data || !this.isCompleted(data)) {
      data = await this.authedPost('/checkout/payment/status', {
        paymentID: gatewayPaymentId,
      });
    }

    return this.interpret(data, gatewayPaymentId);
  }

  private isCompleted(data: Json): boolean {
    return (
      String(data.statusCode) === '0000' &&
      String(data.transactionStatus) === 'Completed'
    );
  }

  private interpret(data: Json, requestedId: string): GatewayVerifyResult {
    if (this.isCompleted(data)) {
      if (
        !data.trxID ||
        data.amount === undefined ||
        !data.merchantInvoiceNumber
      ) {
        return { kind: 'FAILED', reason: 'Incomplete provider response' };
      }

      return {
        kind: 'COMPLETED',
        gatewayPaymentId: String(data.paymentID ?? requestedId),
        transactionId: String(data.trxID),
        amount: String(data.amount),
        currency: String(data.currency ?? 'BDT'),
        invoiceNumber: String(data.merchantInvoiceNumber),
      };
    }

    const transactionStatus = String(data.transactionStatus ?? '');

    if (transactionStatus === 'Initiated' || transactionStatus === 'Authorized') {
      return { kind: 'PENDING' };
    }

    return {
      kind: 'FAILED',
      reason: String(
        data.statusMessage ?? data.errorMessage ?? 'Payment not completed',
      ),
    };
  }

  // ------------------------------------------------------------------ inbound

  parseCallback(query: Record<string, unknown>): ParsedCallback | null {
    const rawId = query.paymentID ?? query.paymentId;

    if (typeof rawId !== 'string' || rawId.length === 0 || rawId.length > 128) {
      return null;
    }

    return {
      gatewayPaymentId: rawId,
      hintStatus: typeof query.status === 'string' ? query.status : null,
    };
  }

  // IPN/webhook-এর শুধু payment id বের করা হয় (best-effort)। বাকি কিছুই
  // বিশ্বাস করা হয় না — আসল অবস্থা সবসময় API query দিয়ে যাচাই হয়।
  extractPaymentIdFromNotification(payload: unknown): string | null {
    const pick = (value: unknown): string | null => {
      if (!value || typeof value !== 'object') return null;

      const record = value as Record<string, unknown>;
      const id = record.paymentID ?? record.paymentId;

      return typeof id === 'string' && id.length > 0 && id.length <= 128
        ? id
        : null;
    };

    const direct = pick(payload);
    if (direct) return direct;

    // SNS-style envelope: { Message: "<json string>" }
    if (payload && typeof payload === 'object') {
      const message = (payload as Record<string, unknown>).Message;

      if (typeof message === 'string') {
        try {
          return pick(JSON.parse(message));
        } catch {
          return null;
        }
      }
    }

    return null;
  }
}