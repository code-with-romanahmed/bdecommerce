import { Injectable, NotFoundException } from '@nestjs/common';
import type { Numeric } from '@prisma/orm-postgres/target/codec-types';

import { db } from '../prisma/db.js';

import type { RecordPaymentDto } from './payment.dto.js';

function money(value: number): Numeric<12, 2> {
  return value.toFixed(2) as Numeric<12, 2>;
}

@Injectable()
export class PaymentService {
  async recordPayment(
    organizationId: number,
    orderId: number,
    dto: RecordPaymentDto,
  ) {
    const order = await db.orm.public.Order
      .where({ id: orderId, organizationId })
      .first();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const payment = await db.orm.public.Payment.create({
      orderId: order.id,
      amount: money(dto.amount),
      currency: order.currency,
      status: dto.status ?? 'PENDING',
      method: dto.method,
      transactionId: dto.transactionId,
    });

    // If this (and any prior) payment(s) now cover the order total,
    // mark the order as PAID.
    if (payment.status === 'PAID') {
      const paidPayments = await db.orm.public.Payment
        .where({ orderId: order.id, status: 'PAID' })
        .all();

      const totalPaid = paidPayments.reduce(
        (sum, p) => sum + Number(p.amount),
        0,
      );

      if (totalPaid >= Number(order.grandTotal)) {
        await db.orm.public.Order
          .where({ id: order.id, organizationId })
          .update({ paymentStatus: 'PAID' });
      }
    }

    return payment;
  }

  async listPayments(organizationId: number, orderId: number) {
    const order = await db.orm.public.Order
      .where({ id: orderId, organizationId })
      .first();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return db.orm.public.Payment.where({ orderId: order.id }).all();
  }
}
