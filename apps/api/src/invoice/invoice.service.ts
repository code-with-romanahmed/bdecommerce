// invoice/invoice.service.ts
import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { db } from '../prisma/db.js';

import { buildInvoiceNumber } from './invoice-number.util.js';

@Injectable()
export class InvoiceService {
  /**
   * একটা Order-এর জন্য Invoice তৈরি করে (idempotent — আগে থেকে
   * থাকলে নতুন করে না বানিয়ে existing-টাই ফেরত দেয়, ডুপ্লিকেট
   * এড়াতে)। Order status যখন CONFIRMED/PAID-এ যায়, তখন এটা কল
   * করা হবে (কোথায় কল হবে সেটা order.service.ts-এর status-update
   * মেথডে বসাতে হবে — আলাদাভাবে wire করে দেওয়া হবে)।
   */
  async generateForOrder(
    organizationId: number,
    orderId: number,
  ) {
    const existing =
      await db.orm.public.Invoice
        .where({ orderId })
        .first();

    if (existing) {
      return existing;
    }

    const order =
      await db.orm.public.Order
        .where({
          id: orderId,
          organizationId,
        })
        .first();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const shippingAddress = [
      order.shippingAddressLine1,
      order.shippingAddressLine2,
      order.shippingCity,
      order.shippingDistrict,
      order.shippingPostalCode,
      order.shippingCountry,
    ]
      .filter(Boolean)
      .join(', ');

    return db.orm.public.Invoice.create({
      orderId: order.id,
      invoiceNumber: buildInvoiceNumber(order.id),
      currency: order.currency,
      subtotal: order.subtotal,
      discountTotal: order.discountTotal,
      shippingTotal: order.shippingTotal,
      taxTotal: order.taxTotal,
      grandTotal: order.grandTotal,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      billingAddress: null, // Order model-এ আলাদা billing address নেই
      shippingAddress,
    });
  }

  /**
   * organizationId দিয়ে scoped — cross-org invoice leak আটকাতে।
   * ownership (staff vs owning customer) চেক এটার caller-এ
   * (InvoiceAccessGuard) হয়, এখানে না।
   */
  async getInvoice(
    organizationId: number,
    invoiceId: number,
  ) {
    const invoice =
      await db.orm.public.Invoice
        .where({ id: invoiceId })
        .first();

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Invoice-এ নিজের organizationId column নেই (Order-এর মাধ্যমে
    // পরোক্ষভাবে scoped), তাই owning order দিয়ে org যাচাই করা হচ্ছে
    const order =
      await db.orm.public.Order
        .where({
          id: invoice.orderId,
          organizationId,
        })
        .first();

    if (!order) {
      throw new NotFoundException('Invoice not found');
    }

    return { invoice, order };
  }
}
