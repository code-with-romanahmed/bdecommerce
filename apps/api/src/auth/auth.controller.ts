import {
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { OtpService } from '../otp/otp.service.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
  ) {}

  @Post('login')
  async login() {
    return {
      message:
        'Use POST /auth/otp/generate and POST /auth/otp/verify for OTP authentication.',
    };
  }

  @Post('otp/verify-login')
  async verifyLogin(
    @Req()
    request: AuthenticatedRequest & {
      body: { phone?: string; otp?: string };
    },
  ) {
    const phone = request.body?.phone;
    const otp = request.body?.otp;

    if (!phone || !otp) {
      return {
        message: 'phone and otp are required',
      };
    }

    await this.otpService.verify(phone, otp);

    const user = await this.authService.findOrCreateUser(phone);
    const accessToken = await this.authService.issueAccessToken(user);

    return {
      message: 'Login successful',
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 900,
      user,
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@Req() request: AuthenticatedRequest) {
    return {
      user: request.authUser,
    };
  }
}