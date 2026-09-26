// order/order-access.guard.ts
import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { db } from '../prisma/db.js';

import { OrderAccessService } from './order-access.service.js';

@Injectable()
export class OrderAccessGuard implements CanActivate {
  constructor(private readonly orderAccess: OrderAccessService) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const request =
      context
        .switchToHttp()
        .getRequest<AuthenticatedRequest>();

    const user = request.authUser;
    if (!user) {
      return false;
    }

    const orderId = Number(request.params?.id);

    const order =
      await db.orm.public.Order
        .where({
          id: orderId,
          organizationId: user.organizationId,
        })
        .first();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const allowed = await this.orderAccess.canAccessOrder(user, order);
    if (!allowed) {
      throw new ForbiddenException(
        'You do not have access to this order',
      );
    }

    return true;
  }
}