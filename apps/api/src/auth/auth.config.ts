import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  jwtSecret: process.env.JWT_SECRET,

  accessTokenTtlSeconds: 15 * 60,

  refreshTokenTtlSeconds: 30 * 24 * 60 * 60,

  otp: {
    ttlSeconds: 5 * 60,
    cooldownSeconds: 60,
    maxAttempts: 5,
    maxRequestsPerHour: 5,
  },

  // Daraz-style marketplace: a self-registered customer (OTP or OAuth)
  // isn't tied to any single seller's organization. They're assigned to
  // this one platform-wide organization instead. Must be seeded once
  // (see migration note) before any self-registration can succeed.
  defaultCustomerOrganizationId: Number(
    process.env.DEFAULT_CUSTOMER_ORGANIZATION_ID ?? 0,
  ),

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
  },

  // Short-lived token issued between "Google verified, but we don't have
  // a phone for this person yet" and "phone OTP verified, account linked
  // or created". Deliberately much shorter than the access token.
  oauthTempTokenTtlSeconds: 10 * 60,
}));