import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

import { VerifyOtpDto } from '../otp/otp.dto.js';
import { OtpService } from '../otp/otp.service.js';
import { RequirePermission } from '../rbac/permission.decorator.js';
import { PermissionGuard } from '../rbac/permission.guard.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

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

class VerifyLoginSessionDto extends VerifyOtpDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  deviceId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  deviceName?: string;
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
  async verifyLogin(
    @Body() body: VerifyLoginSessionDto,
  ) {
    await this.otpService.verify(
      body.phone,
      body.otp,
    );

  const user =
  await this.authService.findUserByPhone(
    body.phone,
  );

if (!user) {
  throw new UnauthorizedException(
    'User account is not provisioned',
  );
}

   const session =
  await this.authService.createSession(
    user,
    body.deviceId,
    body.deviceName,
  );

    return {
      message: 'Login successful',
      ...session,
      user,
    };
  }

  @Post('refresh')
  async refresh(
    @Body() body: RefreshDto,
  ) {
    return this.authService.refreshSession(
      body.refreshToken,
    );
  }

  @Post('logout')
  async logout(
    @Body() body: LogoutDto,
  ) {
    await this.authService.logout(
      body.refreshToken,
    );

    return {
      message: 'Logout successful',
    };
  }

   @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      user: request.authUser,
    };
  }

  @Get('rbac-test')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('user.read')
  rbacTest(@Req() request: AuthenticatedRequest) {
    return {
      message: 'RBAC permission granted',
      userId: request.authUser?.id,
      organizationId: request.authUser?.organizationId,
    };
  }

}
