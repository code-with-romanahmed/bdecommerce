import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import type {
    GatewayCreateInput,
    GatewayCreateResult,
    GatewayVerifyResult,
    ParsedCallback,
    PaymentGateway,
    VerifyMode,
} from './payment-gateway.types.js';

/**
 * Nagad adapter — কাঠামো প্রস্তুত, বাস্তবায়ন বাকি।
 *
 * কেন বাকি: Nagad-এর ডক পাবলিক নয় (merchant onboarding-এর পর পাওয়া যায়)
 * এবং ফ্লোতে merchant/gateway RSA key দিয়ে sensitiveData encrypt ও
 * signature করতে হয়। ডক ছাড়া আন্দাজে লিখলে টাকার কোডে ভুল ঢুকবে।
 *
 * বাস্তবায়নের সময় যা মানতে হবে (bKash-এর মতোই):
 *  - createPayment: server-side initialize + checkout-complete, amount সার্ভারের
 *  - verifyPayment: callback-এ পাওয়া payment_ref_id দিয়ে Nagad-এর verify
 *    API সার্ভার থেকে কল; সাড়া-র status/amount/orderId আমাদের intent-এর সাথে মেলানো
 *  - parseCallback: শুধু payment_ref_id বের করবে; status কেবল ইঙ্গিত
 */
@Injectable()
export class NagadGateway implements PaymentGateway {
  readonly provider = 'NAGAD' as const;

  private notReady(): never {
    throw new ServiceUnavailableException('Nagad is not available yet');
  }

  async createPayment(_input: GatewayCreateInput): Promise<GatewayCreateResult> {
    return this.notReady();
  }

  async verifyPayment(
    _gatewayPaymentId: string,
    _mode: VerifyMode,
  ): Promise<GatewayVerifyResult> {
    return this.notReady();
  }

  parseCallback(_query: Record<string, unknown>): ParsedCallback | null {
    return null;
  }

  extractPaymentIdFromNotification(_payload: unknown): string | null {
    return null;
  }
}