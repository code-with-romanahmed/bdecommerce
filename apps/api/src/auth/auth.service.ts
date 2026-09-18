import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { db } from '../prisma/db.js';
import { AuthSessionService } from './auth-session.service.js';
import type { AuthUser, JwtPayload } from './auth.types.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  async findOrCreateUser(phone: string): Promise<AuthUser> {
    const existingUser = await db.orm.public.User
      .where({ phone })
      .first();

    if (existingUser) {
      return {
        id: existingUser.id,
        organizationId: existingUser.organizationId,
        phone: existingUser.phone,
        email: existingUser.email,
        name: existingUser.name,
      };
    }

    const organization = await db.orm.public.Organization.create({
      name: `Business ${phone.slice(-4)}`,
      slug: `business-${phone.slice(-10)}`,
    });

    const user = await db.orm.public.User.create({
      organizationId: organization.id,
      phone,
    });

    return {
      id: user.id,
      organizationId: user.organizationId,
      phone: user.phone,
      email: user.email,
      name: user.name,
    };
  }

  async issueAccessToken(user: AuthUser): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      organizationId: user.organizationId,
      phone: user.phone,
    };

    return this.jwtService.signAsync(payload);
  }

  async createSession(user: AuthUser) {
    const { sessionId, refreshToken } =
      this.authSessionService.createRefreshToken();

    await this.authSessionService.saveSession(
      sessionId,
      user.id,
      user.organizationId,
      refreshToken,
    );

    const accessToken = await this.issueAccessToken(user);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: 900,
    };
  }

  async refreshSession(refreshToken: string) {
    const parts = refreshToken.split('.');

    if (parts.length !== 2) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const sessionId = parts[0];

    const session =
      await this.authSessionService.validateSession(
        sessionId,
        refreshToken,
      );

    if (!session) {
      throw new UnauthorizedException(
        'Invalid or expired refresh token',
      );
    }

    const user = await this.getUserById(session.userId);

    if (!user) {
      await this.authSessionService.revokeSession(sessionId);

      throw new UnauthorizedException('User not found');
    }

    await this.authSessionService.revokeSession(sessionId);

    return this.createSession(user);
  }

  async logout(refreshToken: string): Promise<void> {
    const parts = refreshToken.split('.');

    if (parts.length !== 2) {
      return;
    }

    await this.authSessionService.revokeSession(parts[0]);
  }

  async verifyAccessToken(token: string): Promise<JwtPayload> {
    return this.jwtService.verifyAsync<JwtPayload>(token);
  }

  async getUserById(id: number): Promise<AuthUser | null> {
    const user = await db.orm.public.User
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
