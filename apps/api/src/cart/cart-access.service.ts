import { Injectable } from '@nestjs/common';

import { db } from '../prisma/db.js';

import { RbacService } from '../rbac/rbac.service.js';
import type { AuthUser } from '../auth/auth.types.js';

@Injectable()
export class CartAccessService {
  constructor(private readonly rbacService: RbacService) {}

  async getCart(organizationId: number, cartId: number) {
    return db.orm.public.Cart
      .where({
        id: cartId,
        organizationId,
      })
      .first();
  }

  /**
   * একটা নির্দিষ্ট customerId-তে user-টার access আছে কিনা।
   * ADMIN/MANAGER/SUPER_ADMIN -> সবসময় true
   * CASHIER -> শুধু active assignment থাকলে true
   * CUSTOMER -> শুধু নিজের Customer রেকর্ড হলে true
   */
  async canAccessCustomer(
    user: AuthUser,
    targetCustomerId: number,
  ): Promise<boolean> {
    const { id: userId, organizationId } = user;

    if (
      (await this.rbacService.hasRole(userId, organizationId, 'SUPER_ADMIN')) ||
      (await this.rbacService.hasRole(userId, organizationId, 'ADMIN')) ||
      (await this.rbacService.hasRole(userId, organizationId, 'MANAGER'))
    ) {
      return true;
    }

    if (await this.rbacService.hasRole(userId, organizationId, 'CASHIER')) {
      const assignment =
        await db.orm.public.CashierAssignment
          .where({
            cashierId: userId,
            customerId: targetCustomerId,
            isActive: true,
          })
          .first();

      return !!assignment;
    }

    if (await this.rbacService.hasRole(userId, organizationId, 'CUSTOMER')) {
      const ownCustomer =
        await db.orm.public.Customer
          .where({
            id: targetCustomerId,
            organizationId,
            userId,
          })
          .first();

      return !!ownCustomer;
    }

    return false;
  }

  /**
   * ADMIN/MANAGER/SUPER_ADMIN/CASHIER — এদের সবাইকে "staff" ধরা হচ্ছে
   * guest-cart access-এর ক্ষেত্রে। Guard থেকে সরাসরি এটা কল হবে।
   */
  async isStaff(user: AuthUser): Promise<boolean> {
    const { id: userId, organizationId } = user;
    return (
      (await this.rbacService.hasRole(userId, organizationId, 'SUPER_ADMIN')) ||
      (await this.rbacService.hasRole(userId, organizationId, 'ADMIN')) ||
      (await this.rbacService.hasRole(userId, organizationId, 'MANAGER')) ||
      (await this.rbacService.hasRole(userId, organizationId, 'CASHIER'))
    );
  }

  /**
   * একটা Cart রো-তে access আছে কিনা।
   * cart.customerId থাকলে canAccessCustomer দিয়ে চেক হয়।
   * guestSessionId cart (customerId null) হলে শুধু staff role
   * (ADMIN/MANAGER/CASHIER) অ্যাক্সেস পাবে — guest cart-এর প্রকৃত
   * owner-ship প্রমাণ করার কোনো mechanism (session token/cookie
   * verify) এখনও নেই, এটা আলাদাভাবে ডিজাইন করা দরকার (নিচে নোট)।
   */
  async canAccessCart(
    user: AuthUser,
    cart: { customerId?: number | null; guestSessionId?: string | null },
  ): Promise<boolean> {
    if (cart.customerId) {
      return this.canAccessCustomer(user, cart.customerId);
    }

    // guest cart — শুধু staff। CUSTOMER role-কে এখানে deny করা হচ্ছে,
    // কারণ guest cart-এর সাথে কোনো identity link নেই যাচাই করার মতো।
    return this.isStaff(user);
  }
}
