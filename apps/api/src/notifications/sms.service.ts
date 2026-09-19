import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  async sendOtp(phone: string, otp: string): Promise<void> {
    // Temporary development adapter.
    // Production will use GreenWeb / MetaSMS.
    this.logger.log(`[DEV SMS] OTP for ${phone}: ${otp}`);
  }
}
