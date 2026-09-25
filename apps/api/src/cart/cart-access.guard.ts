import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';

import { CartAccessService } from './cart-access.service.js';

@Injectable()
export class CartAccessGuard implements CanActivate {
  constructor(
    private readonly cartAccess: CartAccessService,
  ) {}

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

    // ---- কেস ১: /carts/:cartId/... — cart already তৈরি, ownership চেক করো
    const cartIdParam = request.params?.cartId;

    if (cartIdParam) {
      const cartId = Number(cartIdParam);
      const cart = await this.cartAccess.getCart(
        user.organizationId,
        cartId,
      );

      if (!cart) {
        throw new NotFoundException('Cart not found');
      }

      const allowed = await this.cartAccess.canAccessCart(
        user,
        cart,
      );

      if (!allowed) {
        throw new ForbiddenException(
          'You do not have access to this cart',
        );
      }

      return true;
    }

    // ---- কেস ২: GET /carts/active?customerId=X — cart নেই route param-এ,
    // কিন্তু কার cart দেখতে চাওয়া হচ্ছে সেটা query-তে আছে
    const targetCustomerIdRaw =
      request.query?.customerId ?? request.body?.customerId;

    if (targetCustomerIdRaw) {
      const targetCustomerId = Number(targetCustomerIdRaw);
      const allowed = await this.cartAccess.canAccessCustomer(
        user,
        targetCustomerId,
      );

      if (!allowed) {
        throw new ForbiddenException(
          "You do not have access to this customer's cart",
        );
      }

      return true;
    }

    // ---- কেস ৩: guestSessionId দিয়ে কাজ করা হচ্ছে (query বা body) —
    // guest cart-এর কোনো verifiable owner নেই, তাই staff-only রাখা হলো,
    // cartId-route-এর guest-cart policy-র সাথে সামঞ্জস্য রেখে।
    const guestSessionId =
      request.query?.guestSessionId ?? request.body?.guestSessionId;

    if (guestSessionId) {
      const staff = await this.cartAccess.isStaff(user);

      if (!staff) {
        throw new ForbiddenException(
          'Guest cart access is limited to staff',
        );
      }

      return true;
    }

    // না cartId, না customerId, না guestSessionId — কিছুই দেওয়া হয়নি।
    // এটা ownership-এর প্রশ্ন না, DTO validation-এর প্রশ্ন — সেখানেই
    // (CreateCartDto / service-এর BadRequestException) হ্যান্ডেল হবে।
    return true;
  }
}
