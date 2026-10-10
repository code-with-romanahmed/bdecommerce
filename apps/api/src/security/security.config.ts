// CORS ও helmet-এর নীতি এক জায়গায়। ইচ্ছা করে framework থেকে আলাদা রাখা,
// যাতে নিয়মগুলো (ENV পার্স, ডিফল্ট, ভুল মানে থামা) আলাদাভাবে পরীক্ষা করা যায়।

export type CorsPolicy =
  | { kind: 'deny' }
  | { kind: 'allow-all' }
  | { kind: 'allow-list'; origins: string[] };

/**
 * CORS_ORIGINS (কমা দিয়ে আলাদা, যেমন "http://localhost:3000,https://shop.example.com")
 * থেকে নীতি ঠিক করে।
 *
 *  - সেট থাকলে            → শুধু ওই origin-গুলো (সব পরিবেশে)
 *  - "*" থাকলে            → সব origin (স্পষ্ট সিদ্ধান্ত)
 *  - সেট নেই + production → কোনো cross-origin নয় (আজকের আচরণই বহাল)
 *  - সেট নেই + অন্য সব    → সব origin (ডেভেলপমেন্টের সুবিধা)
 *
 * ভুল মান (স্কিম ছাড়া, ftp:// ইত্যাদি) দিলে সার্ভার শুরুতেই থামে।
 */
export function resolveCorsPolicy(
  raw: string | undefined,
  nodeEnv: string | undefined,
): CorsPolicy {
  const items = (raw ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (items.length === 0) {
    return nodeEnv === 'production' ? { kind: 'deny' } : { kind: 'allow-all' };
  }

  if (items.includes('*')) {
    return { kind: 'allow-all' };
  }

  const origins = items.map((item) => {
    let url: URL;

    try {
      url = new URL(item);
    } catch {
      throw new Error(
        `CORS_ORIGINS-এ ভুল মান "${item}" — স্কিমসহ লিখুন, যেমন https://shop.example.com`,
      );
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(
        `CORS_ORIGINS-এ "${item}" গ্রহণযোগ্য নয় — শুধু http:// বা https://`,
      );
    }

    // পথ/শেষের স্ল্যাশ বাদ দিয়ে শুধু origin (স্কিম + হোস্ট + পোর্ট)
    return url.origin;
  });

  return { kind: 'allow-list', origins: [...new Set(origins)] };
}

// enableCors-এর অপশন। deny হলে null (CORS-ই চালু হয় না)।
export function buildCorsOptions(policy: CorsPolicy) {
  if (policy.kind === 'deny') {
    return null;
  }

  return {
    origin: policy.kind === 'allow-all' ? true : policy.origins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    // ব্রাউজারে JS এই header দুটো পড়তে পারে: invoice-এর ফাইলের নাম, আর
    // rate limit (429)-এর অপেক্ষার সময়
    exposedHeaders: ['Content-Disposition', 'Retry-After'],
    // auth শুধু Authorization header দিয়ে (cookie নয়), তাই credentials বন্ধ
    credentials: false,
    maxAge: 600,
  };
}

/**
 * Content-Security-Policy header-এর মান: শুধু frame-ancestors, অর্থাৎ কোন
 * ওয়েবসাইট এই API-র পাতা (যেমন label-এর inline PDF) iframe-এ দেখাতে পারবে।
 *
 * কেন helmet-এর CSP ব্যবহার হচ্ছে না:
 *  - helmet-এর ডিফল্ট CSP (object-src 'none' ইত্যাদি) Chrome-এর PDF viewer
 *    ভাঙতে পারে, আর নতুন helmet শুধু frame-ancestors-এর CSP-ও মানে না
 *    (default-src বাধ্যতামূলক)। তাই এই একটা header আমরা নিজেরাই বসাই।
 */
export function buildFrameAncestorsHeader(policy: CorsPolicy): string {
  const sources =
    policy.kind === 'allow-all'
      ? ['*']
      : policy.kind === 'allow-list'
        ? ["'self'", ...policy.origins]
        : ["'self'"];

  return `frame-ancestors ${sources.join(' ')}`;
}

/**
 * helmet-এর অপশন (CSP বাদ — উপরে কারণ দেখুন)।
 *  - X-Frame-Options বাদ (পুরনো); framing এখন CSP frame-ancestors দিয়ে নিয়ন্ত্রিত।
 *  - Cross-Origin-Resource-Policy: cross-origin, নইলে অন্য origin-এর পাতা
 *    (যেমন <img>/<iframe>) এই API-র ফাইল দেখাতে পারত না।
 */
export function buildHelmetOptions() {
  return {
    contentSecurityPolicy: false as const,
    frameguard: false as const,
    crossOriginResourcePolicy: { policy: 'cross-origin' as const },
  };
}