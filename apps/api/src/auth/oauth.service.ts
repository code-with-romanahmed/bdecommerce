import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';

import { OtpService } from '../otp/otp.service.js';
import { db } from '../prisma/db.js';
import authConfig from './auth.config.js';
import { AuthService } from './auth.service.js';
import type { AuthUser, OAuthTempTokenPayload } from './auth.types.js';

interface GoogleProfile {
  providerUserId: string;
  email: string | null;
  name: string | null;
}

@Injectable()
export class OAuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
  ) {
    this.googleClient = new OAuth2Client(this.config.google.clientId);
  }

  // -------------------------------------------------------------------
  // Step 1: verify the Google ID token the frontend obtained from
  // Google's SDK. We never trust email/name the frontend sends directly
  // — only what Google's own signature-verified payload says.
  // -------------------------------------------------------------------
  private async verifyGoogleIdToken(
    idToken: string,
  ): Promise<GoogleProfile> {
    if (!this.config.google.clientId) {
      throw new BadRequestException(
        'Google login is not configured on this server',
      );
    }

    let ticket;

    try {
      ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.config.google.clientId,
      });
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }

    const payload = ticket.getPayload();

    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid Google token');
    }

    return {
      providerUserId: payload.sub,
      email: payload.email ?? null,
      name: payload.name ?? null,
    };
  }

  private async findUserByOAuthIdentity(
    provider: string,
    providerUserId: string,
  ): Promise<AuthUser | null> {
    const identity = await db.orm.public.OAuthIdentity
      .where({ provider, providerUserId })
      .first();

    if (!identity) {
      return null;
    }

    return this.authService.getUserById(identity.userId);
  }

  private issueTempToken(
    payload: OAuthTempTokenPayload,
  ): string {
    return this.jwtService.sign(payload, {
      expiresIn: this.config.oauthTempTokenTtlSeconds,
    });
  }

  private verifyTempToken(token: string): OAuthTempTokenPayload {
    let payload: OAuthTempTokenPayload;

    try {
      payload = this.jwtService.verify<OAuthTempTokenPayload>(token);
    } catch {
      throw new UnauthorizedException(
        'OAuth session expired, please sign in again',
      );
    }

    if (payload.purpose !== 'oauth_complete') {
      throw new UnauthorizedException('Invalid token');
    }

    return payload;
  }

  // -------------------------------------------------------------------
  // POST /auth/oauth/google
  //
  // Returning user (OAuthIdentity already linked) → logs straight in.
  // First-time user → returns a tempToken; the frontend must then collect
  // a phone number, request an OTP (existing /auth/otp/generate), and
  // call completeRegistration() below.
  // -------------------------------------------------------------------
  async loginWithGoogle(
    idToken: string,
    deviceId?: string,
    deviceName?: string,
  ): Promise<
    | { status: 'logged_in'; session: Awaited<ReturnType<AuthService['createSession']>>; user: AuthUser }
    | { status: 'phone_required'; tempToken: string; suggestedEmail: string | null; suggestedName: string | null }
  > {
    const profile = await this.verifyGoogleIdToken(idToken);

    const existingUser = await this.findUserByOAuthIdentity(
      'GOOGLE',
      profile.providerUserId,
    );

    if (existingUser) {
      const session = await this.authService.createSession(
        existingUser,
        deviceId,
        deviceName,
      );

      return { status: 'logged_in', session, user: existingUser };
    }

    const tempToken = this.issueTempToken({
      purpose: 'oauth_complete',
      provider: 'GOOGLE',
      providerUserId: profile.providerUserId,
      email: profile.email,
      name: profile.name,
    });

    return {
      status: 'phone_required',
      tempToken,
      suggestedEmail: profile.email,
      suggestedName: profile.name,
    };
  }

  // -------------------------------------------------------------------
  // POST /auth/oauth/complete
  //
  // Phone is OTP-verified here before any account is created or linked —
  // this is what stops someone from typing in a stranger's phone number
  // to hijack their account.
  // -------------------------------------------------------------------
  async completeRegistration(
    tempToken: string,
    phone: string,
    otp: string,
    deviceId?: string,
    deviceName?: string,
  ) {
    const payload = this.verifyTempToken(tempToken);

    await this.otpService.verify(phone, otp);

    // Someone may have linked this provider identity in the meantime
    // (e.g. two tabs). Re-check before creating a duplicate.
    const alreadyLinked = await this.findUserByOAuthIdentity(
      payload.provider,
      payload.providerUserId,
    );

    if (alreadyLinked) {
      const session = await this.authService.createSession(
        alreadyLinked,
        deviceId,
        deviceName,
      );

      return { session, user: alreadyLinked };
    }

    // Match by phone first (just OTP-verified), then by email (Google's
    // own verified claim) — either is an acceptable basis to link rather
    // than create a duplicate account.
    let targetUser = await db.orm.public.User
      .where({ phone })
      .first();

    if (!targetUser && payload.email) {
      targetUser = await db.orm.public.User
        .where({ email: payload.email })
        .first();
    }

    if (!targetUser) {
      if (!this.config.defaultCustomerOrganizationId) {
        throw new BadRequestException(
          'Platform is not configured for self-registration (DEFAULT_CUSTOMER_ORGANIZATION_ID missing)',
        );
      }

      targetUser = await db.orm.public.User.create({
        organizationId: this.config.defaultCustomerOrganizationId,
        phone,
        email: payload.email ?? undefined,
        name: payload.name ?? undefined,
      });

      await db.orm.public.Customer.create({
        organizationId: this.config.defaultCustomerOrganizationId,
        userId: targetUser.id,
        phone,
        email: payload.email ?? undefined,
        name: payload.name ?? undefined,
      });
    }

    await db.orm.public.OAuthIdentity.create({
      userId: targetUser.id,
      provider: payload.provider,
      providerUserId: payload.providerUserId,
      email: payload.email ?? undefined,
    });

    const authUser = await this.authService.getUserById(targetUser.id);

    if (!authUser) {
      throw new BadRequestException('Account linking failed');
    }

    const session = await this.authService.createSession(
      authUser,
      deviceId,
      deviceName,
    );

    return { session, user: authUser };
  }
}