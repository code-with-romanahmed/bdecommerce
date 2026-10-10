import {
    CanActivate,
    ExecutionContext,
    HttpException,
    HttpStatus,
    Injectable,
    Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';

import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { RedisService } from '../redis/redis.service.js';
import {
    RATE_LIMIT_KEY,
    type RateLimitRule,
} from './rate-limit.decorator.js';

/**
 * Redis-ভিত্তিক fixed-window rate limiter (আলাদা প্যাকেজ লাগে না)।
 *
 * - Guard pipe-এর আগে চলে, তাই ভুল/অবৈধ রিকোয়েস্টও গোনা হয়।
 * - Redis-এ সমস্যা হলে রিকোয়েস্ট আটকায় না (fail-open), শুধু warning লগ হয়।
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rules = this.reflector.get<RateLimitRule[] | undefined>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );

    if (!rules || rules.length === 0) {
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const redis = this.redisService.getClient();

    for (const rule of rules) {
      const key = `ratelimit:${rule.name}:${this.identity(rule, request)}`;

      let count: number;
      let ttl: number;

      try {
        // INCR ও TTL একসাথে (atomic)
        const results = await redis.multi().incr(key).ttl(key).exec();

        count = Number(results?.[0]?.[1]);
        ttl = Number(results?.[1]?.[1]);

        if (!Number.isFinite(count)) {
          throw new Error('Unexpected Redis response');
        }

        // key নতুন (TTL নেই) হলে window শুরু করো। আগের কোনো কারণে
        // TTL ছাড়া key থেকে গেলেও এটা সেটা ঠিক করে দেয়।
        if (!Number.isFinite(ttl) || ttl < 0) {
          await redis.expire(key, rule.windowSeconds);
          ttl = rule.windowSeconds;
        }
      } catch (error) {
        this.logger.warn(
          `Rate limit check skipped (${rule.name}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        continue;
      }

      if (count > rule.limit) {
        const retryAfter = Math.max(ttl, 1);

        response.setHeader('Retry-After', String(retryAfter));

        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Too many requests. Please try again later.',
            retryAfterSeconds: retryAfter,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    return true;
  }

  private identity(
    rule: RateLimitRule,
    request: AuthenticatedRequest,
  ): string {
    if (rule.by === 'user' && request.authUser?.id !== undefined) {
      return `user:${request.authUser.id}`;
    }

    return `ip:${request.ip ?? request.socket?.remoteAddress ?? 'unknown'}`;
  }
}