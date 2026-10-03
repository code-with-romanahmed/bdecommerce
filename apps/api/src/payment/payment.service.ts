import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

    if (order.paymentStatus === 'PAID') {
      throw new BadRequestException('Order is already fully paid');
    }

    // FAILED ছাড়া আগের তৈরি হওয়া সব পেমেন্ট হিসেব করা হচ্ছে (PENDING সহ)
    const existingPayments = await db.orm.public.Payment
      .where({
        orderId: order.id,
      })
      .all();

    const validPayments = existingPayments.filter(
      (payment) => payment.status !== 'FAILED',
    );

    const alreadyPaid = validPayments.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0,
    );

    const orderTotal = Number(order.grandTotal);
    const remainingAmount = orderTotal - alreadyPaid;

    if (dto.amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than 0');
    }

    // Floating point precision এর জন্য 0.01 টাকার Tolerance রাখা হয়েছে
    if (dto.amount > remainingAmount + 0.01) {
      throw new BadRequestException(
        `Payment exceeds remaining amount. Remaining: ${remainingAmount.toFixed(2)}`,
      );
    }

    const newTotalPaid = alreadyPaid + dto.amount;
    const isFullyPaid = newTotalPaid >= orderTotal - 0.01;

    // আংশিক পেমেন্ট হলে PENDING, ফুল পেমেন্ট হলে PAID
    const currentPaymentStatus = isFullyPaid ? 'PAID' : 'PENDING';

    const payment = await db.orm.public.Payment.create({
      orderId: order.id,
      amount: money(dto.amount),
      currency: order.currency,
      status: currentPaymentStatus,
      method: dto.method,
      transactionId: dto.transactionId,
    });

    // অর্ডারের Payment Status আপডেট
    await db.orm.public.Order
      .where({
        id: order.id,
        organizationId,
      })
      .update({
        paymentStatus: currentPaymentStatus,
      });

    return payment;
  }

  async listPayments(
    organizationId: number,
    orderId: number,
  ) {
    const order = await db.orm.public.Order
      .where({ id: orderId, organizationId })
      .first();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return db.orm.public.Payment
      .where({ orderId: order.id })
      .all();
  }
}