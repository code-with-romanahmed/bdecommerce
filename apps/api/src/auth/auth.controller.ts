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
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard.js';
import { RequirePermission } from '../rbac/permission.decorator.js';
import { PermissionGuard } from '../rbac/permission.guard.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import {
  CompleteOAuthRegistrationDto,
  GoogleLoginDto,
} from './oauth.dto.js';
import { OAuthService } from './oauth.service.js';

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
    private readonly oauthService: OAuthService,
  ) {}

  @Post('login')
  async login() {
    return {
      message:
        'Use POST /auth/otp/generate and POST /auth/otp/verify-login for OTP authentication.',
    };
  }

  @Post('otp/verify-login')
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'verify-login', by: 'ip', limit: 20, windowSeconds: 600 })
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

  // -------------------------------------------------------------------
  // Google OAuth: two-step flow.
  //
  // Step 1 (this endpoint): frontend sends the Google ID token. If this
  // Google account is already linked, logs straight in. Otherwise returns
  // a tempToken and the frontend must collect a phone number, call
  // POST /auth/otp/generate with it, then call /auth/oauth/complete.
  // -------------------------------------------------------------------
  @Post('oauth/google')
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'oauth-google', by: 'ip', limit: 30, windowSeconds: 600 })
  async loginWithGoogle(
    @Body() body: GoogleLoginDto,
  ) {
    const result = await this.oauthService.loginWithGoogle(
      body.idToken,
      body.deviceId,
      body.deviceName,
    );

    if (result.status === 'logged_in') {
      return {
        message: 'Login successful',
        ...result.session,
        user: result.user,
      };
    }

    return {
      message: 'Phone verification required to complete registration',
      requiresPhoneVerification: true,
      tempToken: result.tempToken,
      suggestedEmail: result.suggestedEmail,
      suggestedName: result.suggestedName,
    };
  }

  // Step 2: tempToken + an OTP-verified phone number completes the
  // account (link to an existing account by phone/email, or create a
  // new one), then returns a normal session.
  @Post('oauth/complete')
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'oauth-complete', by: 'ip', limit: 20, windowSeconds: 600 })
  async completeOAuthRegistration(
    @Body() body: CompleteOAuthRegistrationDto,
  ) {
    const { session, user } =
      await this.oauthService.completeRegistration(
        body.tempToken,
        body.phone,
        body.otp,
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
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'refresh', by: 'ip', limit: 60, windowSeconds: 600 })
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