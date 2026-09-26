export const COURIER_CHECK_CONFIG = {
  baseUrl: process.env.FRAUDBD_BASE_URL ?? 'https://fraudbd.com',
  apiKey: process.env.FRAUDBD_API_KEY ?? '',
  userName: process.env.FRAUDBD_USERNAME ?? '',
  password: process.env.FRAUDBD_PASSWORD ?? '',
  useSandbox: process.env.FRAUDBD_USE_SANDBOX === 'true',
} as const;