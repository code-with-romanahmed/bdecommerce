import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Numeric } from '@prisma/orm-postgres/target/codec-types';

import { db } from '../prisma/db.js';

import type { CreateOrderDto } from './order.dto.js';

function money(value: number): Numeric<12, 2> {
  return value.toFixed(2) as Numeric<12, 2>;
}

@Injectable()
export class OrderService {
  private async generateOrderNumber(): Promise<string> {
    const now = new Date();
    const datePart =
      String(now.getFullYear()) +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');
    const prefix = `ORD-${datePart}-`;

    // NOTE: fetches every order to compute today's sequence. Fine at
    // current data volume; replace with a dedicated counter/sequence
    // table if order volume grows large enough for this to matter.
    const allOrders = await db.orm.public.Order.all();
    const todaysCount = allOrders.filter((o) =>
      o.orderNumber.startsWith(prefix),
    ).length;

    let seq = todaysCount + 1;
    let orderNumber = `${prefix}${String(seq).padStart(4, '0')}`;

    while (allOrders.some((o) => o.orderNumber === orderNumber)) {
      seq += 1;
      orderNumber = `${prefix}${String(seq).padStart(4, '0')}`;
    }

    return orderNumber;
  }

  async createOrder(organizationId: number, dto: CreateOrderDto) {
    const customer = await db.orm.public.Customer
      .where({ id: dto.customerId, organizationId })
      .first();

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const address = await db.orm.public.CustomerAddress
      .where({ id: dto.addressId, customerId: customer.id })
      .first();

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    const cart = await db.orm.public.Cart
      .where({
        organizationId,
        customerId: customer.id,
        status: 'ACTIVE',
      })
      .first();

    if (!cart) {
      throw new NotFoundException('Active cart not found');
    }

    const cartItems = await db.orm.public.CartItem
      .where({ cartId: cart.id })
      .all();

    if (cartItems.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    // Snapshot price + product info for each line, and compute subtotal.
    const lines: {
      productVariantId: number;
      productName: string;
      sku: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
    }[] = [];
    let subtotal = 0;

    for (const item of cartItems) {
      const variant = await db.orm.public.ProductVariant
        .where({ id: item.productVariantId })
        .first();

      if (!variant) {
        throw new NotFoundException(
          `Product variant ${item.productVariantId} not found`,
        );
      }

      const product = await db.orm.public.Product
        .where({ id: variant.productId, organizationId })
        .first();

      if (!product) {
        throw new NotFoundException('Product not found');
      }

      const unitPrice = Number(variant.price);
      const lineTotal = unitPrice * item.quantity;
      subtotal += lineTotal;

      lines.push({
        productVariantId: variant.id,
        productName: product.name,
        sku: variant.sku,
        quantity: item.quantity,
        unitPrice,
        lineTotal,
      });
    }

    // No discount/shipping/tax logic yet — that's a later step.
    const grandTotal = subtotal;

    const orderNumber = await this.generateOrderNumber();

    const order = await db.orm.public.Order.create({
      organizationId,
      customerId: customer.id,
      orderNumber,
      status: 'PENDING',
      paymentStatus: 'PENDING',
      paymentMethod: dto.paymentMethod ?? 'COD',
      channel: 'ONLINE',
      currency: cart.currency ?? 'BDT',
      subtotal: money(subtotal),
      discountTotal: money(0),
      shippingTotal: money(0),
      taxTotal: money(0),
      grandTotal: money(grandTotal),
      customerName: customer.name ?? address.recipientName,
      customerPhone: customer.phone,
      customerEmail: customer.email ?? undefined,
      shippingRecipientName: address.recipientName,
      shippingPhone: address.phone,
      shippingAddressLine1: address.addressLine1,
      shippingAddressLine2: address.addressLine2 ?? undefined,
      shippingCity: address.city,
      shippingDistrict: address.district,
      shippingPostalCode: address.postalCode ?? undefined,
      shippingCountry: address.country ?? 'BD',
    });

    for (const line of lines) {
      await db.orm.public.OrderItem.create({
        orderId: order.id,
        productVariantId: line.productVariantId,
        productName: line.productName,
        sku: line.sku,
        quantity: line.quantity,
        unitPrice: money(line.unitPrice),
        lineTotal: money(line.lineTotal),
      });
    }

    // Lock the cart so it can't be checked out again.
    const cartUpdated = await db.orm.public.Cart
      .where({ id: cart.id })
      .update({ status: 'CHECKED_OUT' });

    if (!cartUpdated) {
      throw new ConflictException('Failed to close cart after checkout');
    }

    return this.getOrder(organizationId, order.id);
  }

  async getOrder(organizationId: number, orderId: number) {
    const order = await db.orm.public.Order
      .where({ id: orderId, organizationId })
      .first();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const items = await db.orm.public.OrderItem
      .where({ orderId: order.id })
      .all();

    return { ...order, items };
  }

  async listOrders(organizationId: number) {
    return db.orm.public.Order.where({ organizationId }).all();
  }
}
