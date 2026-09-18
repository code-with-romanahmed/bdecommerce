import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { createHash, randomInt } from 'node:crypto';

import { RedisService } from '../redis/redis.service.js';
import { SmsService } from '../notifications/sms.service.js';

@Injectable()
export class OtpService {
  private readonly otpTtlSeconds = 300;
  private readonly cooldownSeconds = 60;
  private readonly maxAttempts = 5;
  private readonly maxRequestsPerHour = 5;

  constructor(
    private readonly redisService: RedisService,
    private readonly smsService: SmsService,
  ) {}

  private hashOtp(otp: string): string {
    return createHash('sha256')
      .update(otp)
      .digest('hex');
  }

  private otpKey(phone: string): string {
    return `otp:login:${phone}`;
  }

  private cooldownKey(phone: string): string {
    return `otp:cooldown:${phone}`;
  }

  private requestCountKey(phone: string): string {
    return `otp:requests:${phone}`;
  }

  async generate(phone: string) {
    const redis = this.redisService.getClient();

    if (await redis.exists(this.cooldownKey(phone))) {
      throw new HttpException(
        'Please wait before requesting another OTP',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const requestCount = await redis.get(
      this.requestCountKey(phone),
    );

    if (
      requestCount &&
      Number(requestCount) >= this.maxRequestsPerHour
    ) {
      throw new HttpException(
        'Too many OTP requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const otp = randomInt(100000, 1000000).toString();

    await redis.hset(this.otpKey(phone), {
      hash: this.hashOtp(otp),
      attempts: '0',
    });

    await redis.expire(
      this.otpKey(phone),
      this.otpTtlSeconds,
    );

    await redis.set(
      this.cooldownKey(phone),
      '1',
      'EX',
      this.cooldownSeconds,
    );

    const count = await redis.incr(
      this.requestCountKey(phone),
    );

    if (count === 1) {
      await redis.expire(
        this.requestCountKey(phone),
        60 * 60,
      );
    }

    await this.smsService.sendOtp(phone, otp);

    return {
      message: 'OTP sent successfully',
      expiresIn: this.otpTtlSeconds,
    };
  }

  async verify(
    phone: string,
    otp: string,
  ): Promise<{ verified: true }> {
    const redis = this.redisService.getClient();
    const key = this.otpKey(phone);

    const data = await redis.hgetall(key);

    if (!data.hash) {
      throw new BadRequestException(
        'Invalid or expired OTP',
      );
    }

    const attempts = Number(data.attempts ?? 0);

    if (attempts >= this.maxAttempts) {
      await redis.del(key);

      throw new HttpException(
        'Too many OTP attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const isValid =
      data.hash === this.hashOtp(otp);

    if (!isValid) {
      const newAttempts = await redis.hincrby(
        key,
        'attempts',
        1,
      );

      if (newAttempts >= this.maxAttempts) {
        await redis.del(key);

        throw new HttpException(
          'Too many OTP attempts',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      throw new BadRequestException(
        'Invalid or expired OTP',
      );
    }

    await redis.del(key);

    return {
      verified: true,
    };
  }
}
