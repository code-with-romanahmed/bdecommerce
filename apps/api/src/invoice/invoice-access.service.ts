// invoice/invoice-access.service.ts
import { Injectable } from '@nestjs/common';

import { db } from '../prisma/db.js';

import { RbacService } from '../rbac/rbac.service.js';
import type { AuthUser } from '../auth/auth.types.js';

@Injectable()
export class InvoiceAccessService {
  constructor(private readonly rbacService: RbacService) {}

  /**
   * ADMIN/MANAGER/CASHIER (staff) সবসময় দেখতে পারবে।
   * CUSTOMER শুধু নিজের order-এর invoice দেখতে পারবে।
   * (CASHIER-কে এখানে assignment-scoped করিনি ইচ্ছাকৃতভাবে —
   * invoice সাধারণত checkout/support-এর পরের ধাপ, phone-order
   * session-এর মতো active-assignment দরকার নেই বলে ধরে নিয়েছি।
   * চাইলে cart-এর মতোই assignment-scoped করা যাবে, বলল বলো।)
   */
  async canAccessInvoice(
    user: AuthUser,
    order: { customerId?: number | null },
  ): Promise<boolean> {
    const { id: userId, organizationId } = user;

    if (
      (await this.rbacService.hasRole(userId, organizationId, 'SUPER_ADMIN')) ||
      (await this.rbacService.hasRole(userId, organizationId, 'ADMIN')) ||
      (await this.rbacService.hasRole(userId, organizationId, 'MANAGER')) ||
      (await this.rbacService.hasRole(userId, organizationId, 'CASHIER'))
    ) {
      return true;
    }

    if (!order.customerId) {
      return false; // guest order — login করা CUSTOMER কারো নিজের না
    }

    if (await this.rbacService.hasRole(userId, organizationId, 'CUSTOMER')) {
      const ownCustomer =
        await db.orm.public.Customer
          .where({
            id: order.customerId,
            organizationId,
            userId,
          })
          .first();

      return !!ownCustomer;
    }

    return false;
  }
}
