import { registerAs } from '@nestjs/config';

const trimSlash = (value: string | undefined) =>
  (value ?? '').trim().replace(/\/+$/, '');

export default registerAs('paymentGateway', () => ({
  // এই API-র নিজের পাবলিক URL (gateway এখানে callback পাঠাবে)।
  // প্রোডাকশনে অবশ্যই https; লোকাল টেস্টে ngrok/cloudflared URL।
  publicApiUrl: trimSlash(process.env.PUBLIC_API_URL),

  // ফ্রন্টএন্ডের URL — পেমেন্ট শেষে ব্রাউজারকে এখানে ফেরত পাঠানো হয়।
  // (নির্দিষ্ট কনফিগ থেকে নেওয়া হয়, রিকোয়েস্ট থেকে নয় — open redirect নেই)
  frontendUrl: trimSlash(process.env.FRONTEND_URL),

  // ঐচ্ছিক: webhook endpoint-এ extra শেয়ার্ড secret (x-webhook-secret header)
  webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET ?? '',

  // একটা পেমেন্ট-চেষ্টা (intent) Redis-এ কত সময় থাকবে
  intentTtlSeconds: 24 * 60 * 60,

  bkash: {
    baseUrl: trimSlash(
      process.env.BKASH_BASE_URL ??
        'https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized',
    ),
    appKey: process.env.BKASH_APP_KEY ?? '',
    appSecret: process.env.BKASH_APP_SECRET ?? '',
    username: process.env.BKASH_USERNAME ?? '',
    password: process.env.BKASH_PASSWORD ?? '',
  },
}));