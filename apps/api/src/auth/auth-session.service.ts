import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

import { RedisService } from '../redis/redis.service.js';

@Injectable()
export class AuthSessionService {
  private readonly refreshTokenTtlSeconds =
    30 * 24 * 60 * 60;

  constructor(private readonly redisService: RedisService) {}

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
  ): Promise<void> {
    const redis = this.redisService.getClient();

    const tokenHash = this.hashToken(refreshToken);

    await redis.hset(this.sessionKey(sessionId), {
      userId: userId.toString(),
      organizationId: organizationId.toString(),
      tokenHash,
    });

    await redis.expire(
      this.sessionKey(sessionId),
      this.refreshTokenTtlSeconds,
    );
  }

  async validateSession(
    sessionId: string,
    refreshToken: string,
  ): Promise<{
    userId: number;
    organizationId: number;
  } | null> {
    const redis = this.redisService.getClient();

    const data = await redis.hgetall(
      this.sessionKey(sessionId),
    );

    if (!data.tokenHash) {
      return null;
    }

    const tokenHash = this.hashToken(refreshToken);

    if (data.tokenHash !== tokenHash) {
      return null;
    }

    return {
      userId: Number(data.userId),
      organizationId: Number(data.organizationId),
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    const redis = this.redisService.getClient();

    await redis.del(this.sessionKey(sessionId));
  }
}
