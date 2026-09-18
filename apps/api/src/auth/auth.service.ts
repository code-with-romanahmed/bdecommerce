import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { db } from '../prisma/db.js';
import type { AuthUser, JwtPayload } from './auth.types.js';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

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
