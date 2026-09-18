import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';

import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';
import { OtpService } from '../otp/otp.service.js';
import { VerifyOtpDto } from '../otp/otp.dto.js';

class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

class LogoutDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

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
        'Use POST /auth/otp/generate and POST /auth/otp/verify-login for OTP authentication.',
    };
  }

  @Post('otp/verify-login')
  async verifyLogin(@Body() body: VerifyOtpDto) {
    await this.otpService.verify(body.phone, body.otp);

    const user = await this.authService.findOrCreateUser(body.phone);
    const session = await this.authService.createSession(user);

    return {
      message: 'Login successful',
      ...session,
      user,
    };
  }

  @Post('refresh')
  async refresh(@Body() body: RefreshDto) {
    return this.authService.refreshSession(body.refreshToken);
  }

  @Post('logout')
  async logout(@Body() body: LogoutDto) {
    await this.authService.logout(body.refreshToken);

    return {
      message: 'Logout successful',
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
