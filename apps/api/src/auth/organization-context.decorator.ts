import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

import type { AuthenticatedRequest } from './jwt-auth.guard.js';

export const OrganizationId = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request =
      context
        .switchToHttp()
        .getRequest<AuthenticatedRequest>();

    const organizationId =
      request.authUser?.organizationId;

    if (!organizationId) {
      throw new UnauthorizedException(
        'Organization context not found',
      );
    }

    return organizationId;
  },
);
