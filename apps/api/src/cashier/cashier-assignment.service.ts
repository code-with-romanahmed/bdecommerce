import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { db } from '../prisma/db.js';

@Injectable()
export class CashierAssignmentService {
  /**
   * নতুন phone-order session শুরু। এর আগে এই cashier-এর যত active
   * assignment ছিল, সব বন্ধ করে দেওয়া হচ্ছে — নাহলে stale assignment
   * থেকে আগের customer-এর cart-এ access থেকে যাবে।
   */
  async startAssignment(
    organizationId: number,
    cashierId: number,
    customerId: number,
  ) {
    const customer =
      await db.orm.public.Customer
        .where({
          id: customerId,
          organizationId,
        })
        .first();

    if (!customer) {
      throw new NotFoundException(
        'Customer not found',
      );
    }

    await this.endActiveAssignments(
      organizationId,
      cashierId,
    );

    return db.orm.public.CashierAssignment.create({
      organizationId,
      cashierId,
      customerId,
      isActive: true,
    });
  }

  /**
   * এই cashier-এর সব active assignment বন্ধ করে দেয় (session শেষ,
   * বা নতুন session শুরুর আগের cleanup)।
   */
  async endActiveAssignments(
    organizationId: number,
    cashierId: number,
  ) {
    const activeAssignments =
      await db.orm.public.CashierAssignment
        .where({
          organizationId,
          cashierId,
          isActive: true,
        })
        .all();

    for (const assignment of activeAssignments) {
      await db.orm.public.CashierAssignment
        .where({ id: assignment.id })
        .update({
          isActive: false,
          endedAt: new Date().toISOString()
        });
    }

    return activeAssignments.length;
  }
}
