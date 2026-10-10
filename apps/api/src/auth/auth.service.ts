import {
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { db } from '../prisma/db.js';
import {
  AuthSessionService,
} from './auth-session.service.js';
import authConfig from './auth.config.js';
import type {
  AuthUser,
  JwtPayload,
} from './auth.types.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authSessionService: AuthSessionService,
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
  ) {}

async findUserByPhone(
  phone: string,
): Promise<AuthUser | null> {
  const user =
    await db.orm.public.User
      .where({ phone })
      .first();

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    organizationId: user.organizationId,
    phone: user.phone,
    email: user.email,
    name: user.name,
  };
}

  async issueAccessToken(
    user: AuthUser,
    sessionId: string,
  ): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      organizationId: user.organizationId,
      phone: user.phone,
      sid: sessionId,
    };

    return this.jwtService.signAsync(payload);
  }

  async createSession(
    user: AuthUser,
    deviceId = 'unknown',
    deviceName = 'Unknown Device',
  ) {
    const {
      sessionId,
      refreshToken,
    } =
      this.authSessionService.createRefreshToken();

    await this.authSessionService.saveSession(
      sessionId,
      user.id,
      user.organizationId,
      refreshToken,
      deviceId,
      deviceName,
    );

    const accessToken =
      await this.issueAccessToken(user, sessionId);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.accessTokenTtlSeconds,
      sessionId,
    };
  }

  async refreshSession(
    refreshToken: string,
  ) {
    const parts = refreshToken.split('.');

    if (
      parts.length !== 2 ||
      !parts[0] ||
      !parts[1]
    ) {
      throw new UnauthorizedException(
        'Invalid refresh token',
      );
    }

    const sessionId = parts[0];

    /*
     * Refresh-token rotation (atomic):
     * validate + পুরনো সেশন মুছে ফেলা একসাথে হয়। একই token দিয়ে একসাথে
     * দুটো রিকোয়েস্ট এলে একটাই সফল হয়; অন্যটা 401 পায়।
     * (ইউজার না থাকলেও সেশন আগেই মুছে গেছে।)
     */
    const session =
      await this.authSessionService
        .consumeSession(
          sessionId,
          refreshToken,
        );

    if (!session) {
      throw new UnauthorizedException(
        'Invalid or expired refresh token',
      );
    }

    const user =
      await this.getUserById(session.userId);

    if (!user) {
      throw new UnauthorizedException(
        'User not found',
      );
    }

    return this.createSession(
      user,
      session.deviceId,
      session.deviceName,
    );
  }

  async logout(
    refreshToken: string,
  ): Promise<void> {
    const parts = refreshToken.split('.');

    if (
      parts.length !== 2 ||
      !parts[0]
    ) {
      return;
    }

    await this.authSessionService
      .revokeSession(parts[0]);
  }

  async verifyAccessToken(
    token: string,
  ): Promise<JwtPayload> {
    const payload =
      await this.jwtService
        .verifyAsync<JwtPayload>(token);

    // sid ছাড়া (পুরনো ফরম্যাটের বা অন্য ধরনের) টোকেন গ্রহণযোগ্য নয়
    if (typeof payload.sid !== 'string' || payload.sid.length === 0) {
      throw new UnauthorizedException('Invalid access token');
    }

    // সেশন মুছে গেছে (logout / refresh / revoke) → টোকেন সঙ্গে সঙ্গে অচল
    if (!(await this.authSessionService.sessionExists(payload.sid))) {
      throw new UnauthorizedException('Session expired or revoked');
    }

    return payload;
  }

  async getUserById(
    id: number,
  ): Promise<AuthUser | null> {
    const user =
      await db.orm.public.User
        .where({ id })
        .first();

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      organizationId: user.organizationId,
      phone: user.phone,
      email: user.email,
      name: user.name,
    };
  }
}