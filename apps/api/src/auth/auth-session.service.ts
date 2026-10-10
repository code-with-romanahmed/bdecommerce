import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { RedisService } from '../redis/redis.service.js';

export interface AuthSession {
  userId: number;
  organizationId: number;
  deviceId: string;
  deviceName: string;
}

@Injectable()
export class AuthSessionService {
  private readonly refreshTokenTtlSeconds =
    30 * 24 * 60 * 60;

  constructor(
    private readonly redisService: RedisService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256')
      .update(token)
      .digest('hex');
  }

  private sessionKey(sessionId: string): string {
    return `auth:session:${sessionId}`;
  }

  createRefreshToken(): {
    sessionId: string;
    refreshToken: string;
  } {
    const sessionId = randomBytes(16).toString('hex');
    const secret = randomBytes(32).toString('hex');

    return {
      sessionId,
      refreshToken: `${sessionId}.${secret}`,
    };
  }

  async saveSession(
    sessionId: string,
    userId: number,
    organizationId: number,
    refreshToken: string,
    deviceId = 'unknown',
    deviceName = 'Unknown Device',
  ): Promise<void> {
    const redis = this.redisService.getClient();

    await redis.hset(this.sessionKey(sessionId), {
      userId: userId.toString(),
      organizationId: organizationId.toString(),
      deviceId,
      deviceName,
      tokenHash: this.hashToken(refreshToken),
      createdAt: new Date().toISOString(),
    });

    await redis.expire(
      this.sessionKey(sessionId),
      this.refreshTokenTtlSeconds,
    );
  }

  async validateSession(
    sessionId: string,
    refreshToken: string,
  ): Promise<AuthSession | null> {
    const redis = this.redisService.getClient();

    const data = await redis.hgetall(
      this.sessionKey(sessionId),
    );

    if (!data.tokenHash) {
      return null;
    }

    // constant-time তুলনা (দুটোই sha256 hex, তাই সমান দৈর্ঘ্য)
    const stored = Buffer.from(data.tokenHash, 'hex');
    const provided = Buffer.from(this.hashToken(refreshToken), 'hex');

    if (
      stored.length !== provided.length ||
      !timingSafeEqual(stored, provided)
    ) {
      return null;
    }

    return {
      userId: Number(data.userId),
      organizationId: Number(data.organizationId),
      deviceId: data.deviceId ?? 'unknown',
      deviceName: data.deviceName ?? 'Unknown Device',
    };
  }

  /**
   * validate + মুছে ফেলা, একসাথে। একই refresh token দিয়ে দুটো রিকোয়েস্ট
   * একসাথে এলে redis.del-এর ফেরত মান (১ বা ০) ঠিক করে কে জিতল — তাই
   * একটা refresh token থেকে দুটো নতুন সেশন তৈরি হওয়া অসম্ভব।
   */
  async consumeSession(
    sessionId: string,
    refreshToken: string,
  ): Promise<AuthSession | null> {
    const session = await this.validateSession(sessionId, refreshToken);

    if (!session) {
      return null;
    }

    const redis = this.redisService.getClient();
    const deleted = await redis.del(this.sessionKey(sessionId));

    return deleted === 1 ? session : null;
  }

  async revokeSession(
    sessionId: string,
  ): Promise<void> {
    const redis = this.redisService.getClient();

    await redis.del(this.sessionKey(sessionId));
  }

  async sessionExists(
    sessionId: string,
  ): Promise<boolean> {
    const redis = this.redisService.getClient();

    return (await redis.exists(
      this.sessionKey(sessionId),
    )) === 1;
  }
}