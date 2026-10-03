// order/order-access.service.ts
import { Injectable } from '@nestjs/common';

import { db } from '../prisma/db.js';

import type { AuthUser } from '../auth/auth.types.js';
import { RbacService } from '../rbac/rbac.service.js';

@Injectable()
export class OrderAccessService {
  constructor(private readonly rbacService: RbacService) {}

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
   * ADMIN/MANAGER সবসময় access পাবে। CASHIER শুধু active assignment
   * থাকা customer-এর order-এ (Cart-এর মতোই একই CashierAssignment
   * টেবিল reuse করা হচ্ছে)। CUSTOMER শুধু নিজের order-এ।
   * Guest order (customerId null) হলে শুধু staff।
   */
  async canAccessOrder(
    user: AuthUser,
    order: { customerId?: number | null },
  ): Promise<boolean> {
    const { id: userId, organizationId } = user;

    if (
      (await this.rbacService.hasRole(userId, organizationId, 'SUPER_ADMIN')) ||
      (await this.rbacService.hasRole(userId, organizationId, 'ADMIN')) ||
      (await this.rbacService.hasRole(userId, organizationId, 'MANAGER'))
    ) {
      return true;
    }

    if (!order.customerId) {
      // guest order — শুধু staff (CASHIER সহ) অ্যাক্সেস করতে পারবে
      return this.isStaff(user);
    }

    if (await this.rbacService.hasRole(userId, organizationId, 'CASHIER')) {
      const assignment =
        await db.orm.public.CashierAssignment
          .where({
            cashierId: userId,
            customerId: order.customerId,
            isActive: true,
          })
          .first();

      return !!assignment;
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

  /**
   * List endpoint-এর জন্য — guard দিয়ে array filter করা যায় না,
   * তাই এই মেথড বলে দেয় কোন customerId-গুলোর order এই user দেখতে
   * পারবে। null মানে "সব" (unrestricted, staff)। খালি array মানে
   * কিছুই না (role নেই বা link নেই)।
   */
  async getAccessibleCustomerIds(
    user: AuthUser,
  ): Promise<number[] | null> {
    const { id: userId, organizationId } = user;

    if (
      (await this.rbacService.hasRole(userId, organizationId, 'SUPER_ADMIN')) ||
      (await this.rbacService.hasRole(userId, organizationId, 'ADMIN')) ||
      (await this.rbacService.hasRole(userId, organizationId, 'MANAGER'))
    ) {
      return null; // unrestricted
    }

    if (await this.rbacService.hasRole(userId, organizationId, 'CASHIER')) {
      const assignments =
        await db.orm.public.CashierAssignment
          .where({ cashierId: userId, isActive: true })
          .all();

      return assignments.map((a) => a.customerId);
    }

    if (await this.rbacService.hasRole(userId, organizationId, 'CUSTOMER')) {
      const ownCustomer =
        await db.orm.public.Customer
          .where({ organizationId, userId })
          .first();

      return ownCustomer ? [ownCustomer.id] : [];
    }

    return [];
  }
}