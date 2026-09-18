import { Body, Controller, Post } from '@nestjs/common';
import { OtpService } from './otp.service.js';
import { GenerateOtpDto, VerifyOtpDto } from './otp.dto.js';

@Controller('auth/otp')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post('generate')
  generate(@Body() body: GenerateOtpDto) {
    return this.otpService.generate(body.phone);
  }

  @Post('verify')
  verify(@Body() body: VerifyOtpDto) {
    return this.otpService.verify(body.phone, body.otp);
  }
}
