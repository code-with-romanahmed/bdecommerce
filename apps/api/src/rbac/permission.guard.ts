import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { RbacService } from './rbac.service.js';
import {
  REQUIRED_PERMISSION_KEY,
} from './permission.decorator.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';

@Injectable()
export class PermissionGuard
  implements CanActivate
{
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const permission =
      this.reflector.get<string>(
        REQUIRED_PERMISSION_KEY,
        context.getHandler(),
      );

    if (!permission) {
      return true;
    }

    const request =
      context
        .switchToHttp()
        .getRequest<AuthenticatedRequest>();

    const user = request.authUser;

    if (!user) {
      return false;
    }

    await this.rbacService.requirePermission(
      user.id,
      user.organizationId,
      permission,
    );

    return true;
  }
}
