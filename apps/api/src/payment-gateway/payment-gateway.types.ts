export const ONLINE_PROVIDERS = ['BKASH', 'NAGAD'] as const;

export type OnlineProvider = (typeof ONLINE_PROVIDERS)[number];

export interface GatewayCreateInput {
  // "100.00" ফরম্যাটে, সবসময় সার্ভার-হিসাব করা
  amount: string;
  // gateway-তে merchant invoice নম্বর; প্রতিটি চেষ্টায় ইউনিক
  invoiceNumber: string;
  payerReference: string;
  callbackUrl: string;
}

export interface GatewayCreateResult {
  gatewayPaymentId: string;
  redirectUrl: string;
}

// gateway-র সার্ভার-থেকে-সার্ভার উত্তরের ব্যাখ্যা। ব্রাউজারের পাঠানো
// কোনো তথ্য এখানে ঢোকে না।
export type GatewayVerifyResult =
  | {
      kind: 'COMPLETED';
      gatewayPaymentId: string;
      transactionId: string;
      amount: string;
      currency: string;
      invoiceNumber: string;
    }
  | { kind: 'FAILED'; reason: string }
  | { kind: 'PENDING' };

// EXECUTE: গ্রাহক অনুমোদন দিয়েছে বলে ইঙ্গিত পেলে payment চূড়ান্ত করো
// QUERY:   শুধু বর্তমান অবস্থা জিজ্ঞেস করো (কিছু বদলায় না)
export type VerifyMode = 'EXECUTE' | 'QUERY';

export interface ParsedCallback {
  gatewayPaymentId: string;
  // ব্রাউজার-redirect-এ আসা status — শুধু ইঙ্গিত, কখনো প্রমাণ নয়
  hintStatus: string | null;
}

export interface PaymentGateway {
  readonly provider: OnlineProvider;

  createPayment(input: GatewayCreateInput): Promise<GatewayCreateResult>;

  verifyPayment(
    gatewayPaymentId: string,
    mode: VerifyMode,
  ): Promise<GatewayVerifyResult>;

  parseCallback(query: Record<string, unknown>): ParsedCallback | null;

  extractPaymentIdFromNotification(payload: unknown): string | null;
}