import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard.js';
import { GenerateOtpDto, VerifyOtpDto } from './otp.dto.js';
import { OtpService } from './otp.service.js';

@Controller('auth/otp')
@UseGuards(RateLimitGuard)
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  // SMS খরচ/bombing ঠেকাতে IP-ভিত্তিক সীমা। (প্রতি ফোন নম্বরের আলাদা
  // সীমা OtpService-এ আগে থেকেই আছে।)
  @Post('generate')
  @RateLimit(
    { name: 'otp-generate-10m', by: 'ip', limit: 10, windowSeconds: 600 },
    { name: 'otp-generate-1h', by: 'ip', limit: 30, windowSeconds: 3600 },
  )
  generate(@Body() body: GenerateOtpDto) {
    return this.otpService.generate(body.phone);
  }

  @Post('verify')
  @RateLimit({ name: 'otp-verify', by: 'ip', limit: 20, windowSeconds: 600 })
  verify(@Body() body: VerifyOtpDto) {
    return this.otpService.verify(body.phone, body.otp);
  }
}