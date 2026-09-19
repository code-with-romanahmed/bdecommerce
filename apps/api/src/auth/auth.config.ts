
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
}));
