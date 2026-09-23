
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Numeric } from '@prisma/orm-postgres/target/codec-types';

import { db } from '../prisma/db.js';
import {
  CreateOrderDto,
  CreatePaymentDto,
} from './order.dto.js';

const SHIPPING_INSIDE_DHAKA = 60;
const SHIPPING_OUTSIDE_DHAKA = 120;

function calculateShipping(city: string): number {
  return city.trim().toLowerCase() === 'dhaka'
    ? SHIPPING_INSIDE_DHAKA
    : SHIPPING_OUTSIDE_DHAKA;
}

function calculateDiscount(
  subtotal: number,
  type?: 'FLAT' | 'PERCENTAGE',
  value?: number,
): number {
  if (!type || value === undefined) {
    return 0;
  }

  if (value <= 0) {
    return 0;
  }

  if (type === 'FLAT') {
    return Math.min(value, subtotal);
  }

  const discount = (subtotal * value) / 100;

  return Math.min(discount, subtotal);
}

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

  async createOrder(
    organizationId: number,
    dto: CreateOrderDto,
  ) {
    const customer = await db.orm.public.Customer
      .where({
        id: dto.customerId,
        organizationId,
      })
      .first();

    if (!customer) {
      throw new NotFoundException(
        'Customer not found',
      );
    }

    const address = await db.orm.public.CustomerAddress
      .where({
        id: dto.addressId,
        customerId: customer.id,
      })
      .first();

    if (!address) {
      throw new NotFoundException(
        'Address not found',
      );
    }

    const cart = await db.orm.public.Cart
      .where({
        organizationId,
        customerId: customer.id,
        status: 'ACTIVE',
      })
      .first();

    if (!cart) {
      throw new NotFoundException(
        'Active cart not found',
      );
    }

    const cartItems = await db.orm.public.CartItem
      .where({
        cartId: cart.id,
      })
      .all();

    if (cartItems.length === 0) {
      throw new BadRequestException(
        'Cart is empty',
      );
    }

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
      const variant =
        await db.orm.public.ProductVariant
          .where({
            id: item.productVariantId,
          })
          .first();

      if (!variant) {
        throw new NotFoundException(
          `Product variant ${item.productVariantId} not found`,
        );
      }

      const product =
        await db.orm.public.Product
          .where({
            id: variant.productId,
            organizationId,
          })
          .first();

      if (!product) {
        throw new NotFoundException(
          'Product not found',
        );
      }

      const unitPrice = Number(variant.price);
      const lineTotal =
        unitPrice * item.quantity;

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

    const discountTotal = calculateDiscount(
      subtotal,
      dto.discountType,
      dto.discountValue,
    );

    const shippingTotal =
      calculateShipping(address.city);

    const taxTotal = 0;

    const grandTotal =
      subtotal -
      discountTotal +
      shippingTotal +
      taxTotal;

    const runTransaction = async (
      orderNumber: string,
    ) =>
      db.transaction(async (tx) => {
        const reservations: {
          stockId: number;
          branchId: number;
          productVariantId: number;
          quantity: number;
        }[] = [];

        for (const line of lines) {
          const stocks =
            await tx.orm.public.InventoryStock
              .where({
                organizationId,
                productVariantId:
                  line.productVariantId,
              })
              .all();

          const best = stocks
            .map((s) => ({
              s,
              available:
                s.quantity -
                s.reservedQuantity,
            }))
            .filter(
              (x) =>
                x.available >= line.quantity,
            )
            .sort(
              (a, b) =>
                b.available - a.available,
            )[0];

          if (!best) {
            throw new BadRequestException(
              `Insufficient stock for ${line.sku}`,
            );
          }

          const updated =
            await tx.orm.public.InventoryStock
              .where({
                id: best.s.id,
                reservedQuantity:
                  best.s.reservedQuantity,
                quantity: best.s.quantity,
              })
              .update({
                reservedQuantity:
                  best.s.reservedQuantity +
                  line.quantity,
              });

          if (!updated) {
            throw new ConflictException(
              `Failed to reserve stock for ${line.sku}`,
            );
          }

          reservations.push({
            stockId: best.s.id,
            branchId: best.s.branchId,
            productVariantId:
              best.s.productVariantId,
            quantity: line.quantity,
          });
        }

        const order =
          await tx.orm.public.Order.create({
            organizationId,
            customerId: customer.id,
            orderNumber,

            status: 'PENDING',
            paymentStatus: 'PENDING',

            paymentMethod:
              dto.paymentMethod ?? 'COD',
            channel: 'ONLINE',

            currency:
              cart.currency ?? 'BDT',

            subtotal: money(subtotal),
            discountTotal:
              money(discountTotal),
            shippingTotal:
              money(shippingTotal),
            taxTotal: money(taxTotal),
            grandTotal:
              money(grandTotal),

            customerName:
              customer.name ??
              address.recipientName,

            customerPhone:
              customer.phone,

            customerEmail:
              customer.email ??
              undefined,

            shippingRecipientName:
              address.recipientName,

            shippingPhone:
              address.phone,

            shippingAddressLine1:
              address.addressLine1,

            shippingAddressLine2:
              address.addressLine2 ??
              undefined,

            shippingCity:
              address.city,

            shippingDistrict:
              address.district,

            shippingPostalCode:
              address.postalCode ??
              undefined,

            shippingCountry:
              address.country ?? 'BD',
          });

        for (const line of lines) {
          await tx.orm.public.OrderItem.create({
            orderId: order.id,
            productVariantId:
              line.productVariantId,

            productName:
              line.productName,

            sku: line.sku,

            quantity: line.quantity,

            unitPrice:
              money(line.unitPrice),

            lineTotal:
              money(line.lineTotal),
          });
        }

        for (const r of reservations) {
          await tx.orm.public.StockMovement.create({
            organizationId,
            branchId: r.branchId,
            productVariantId:
              r.productVariantId,
            inventoryStockId:
              r.stockId,

            type: 'ADJUSTMENT',

            quantity: r.quantity,

            referenceType: 'ORDER',
            referenceId: order.id,

            note:
              `Reserved for ${orderNumber}`,
          });
        }

        const cartUpdated =
          await tx.orm.public.Cart
            .where({
              id: cart.id,
              status: 'ACTIVE',
            })
            .update({
              status: 'CHECKED_OUT',
            });

        if (!cartUpdated) {
          throw new ConflictException(
            'Failed to close cart after checkout',
          );
        }

        return order.id;
      });

    let orderId: number | undefined;

    for (
      let attempt = 1;
      attempt <= 5;
      attempt++
    ) {
      const orderNumber =
        await this.generateOrderNumber();

      try {
        orderId =
          await runTransaction(
            orderNumber,
          );

        break;
      } catch (error) {
        if (
          error instanceof
          BadRequestException
        ) {
          throw error;
        }

        const message =
          error instanceof Error
            ? error.message
            : String(error);

        const isOrderNumberClash =
          message.includes(
            'order_orderNumber_key',
          ) ||
          message.includes(
            'duplicate key value',
          );

        const isReserveConflict =
          error instanceof
          ConflictException;

        if (
          (!isOrderNumberClash &&
            !isReserveConflict) ||
          attempt === 5
        ) {
          throw error;
        }
      }
    }

    if (orderId === undefined) {
      throw new ConflictException(
        'Could not complete order after retries',
      );
    }

    return this.getOrder(
      organizationId,
      orderId,
    );
  }

  async createPayment(
    organizationId: number,
    orderId: number,
    dto: CreatePaymentDto,
  ) {
    const order =
      await db.orm.public.Order
        .where({
          id: orderId,
          organizationId,
        })
        .first();

    if (!order) {
      throw new NotFoundException(
        'Order not found',
      );
    }

    if (order.status === 'CANCELLED') {
      throw new BadRequestException(
        'Cannot create payment for a cancelled order',
      );
    }

    if (dto.amount <= 0) {
      throw new BadRequestException(
        'Payment amount must be greater than zero',
      );
    }

    // Prevent duplicate transaction ID
    if (dto.transactionId) {
      const existingPayment =
        await db.orm.public.Payment
          .where({
            transactionId:
              dto.transactionId,
          })
          .first();

      if (existingPayment) {
        throw new ConflictException(
          'A payment with this transaction ID already exists',
        );
      }
    }

    const existingPayments =
      await db.orm.public.Payment
        .where({
          orderId: order.id,
        })
        .all();

    const paidAmount =
      existingPayments
        .filter(
          (payment) =>
            payment.status === 'PAID' ||
            payment.status ===
              'AUTHORIZED',
        )
        .reduce(
          (total, payment) =>
            total +
            Number(payment.amount),
          0,
        );

    const orderTotal =
      Number(order.grandTotal);

    const remainingAmount =
      orderTotal - paidAmount;

    if (dto.amount > remainingAmount) {
      throw new BadRequestException(
        `Payment amount exceeds remaining balance of ${remainingAmount.toFixed(2)}`,
      );
    }

    const payment =
      await db.orm.public.Payment.create({
        orderId: order.id,
        amount: money(dto.amount),
        currency: order.currency,
        status: 'PAID',
        method: dto.method,
        transactionId:
          dto.transactionId ??
          undefined,
      });

    const newPaidAmount =
      paidAmount + dto.amount;

    await db.orm.public.Order
      .where({
        id: order.id,
        organizationId,
      })
      .update({
        paymentStatus:
          newPaidAmount >= orderTotal
            ? 'PAID'
            : 'PENDING',
      });

    return payment;
  }

  async confirmOrder(
    organizationId: number,
    orderId: number,
  ) {
    const order =
      await db.orm.public.Order
        .where({
          id: orderId,
          organizationId,
        })
        .first();

    if (!order) {
      throw new NotFoundException(
        'Order not found',
      );
    }

    if (order.status !== 'PENDING') {
      throw new BadRequestException(
        `Only PENDING orders can be confirmed (current: ${order.status})`,
      );
    }

    const updated =
      await db.orm.public.Order
        .where({
          id: order.id,
          organizationId,
          status: 'PENDING',
        })
        .update({
          status: 'CONFIRMED',
        });

    if (!updated) {
      throw new ConflictException(
        'Order status changed, please retry',
      );
    }

    return this.getOrder(
      organizationId,
      order.id,
    );
  }

  async cancelOrder(
    organizationId: number,
    orderId: number,
  ) {
    const order =
      await db.orm.public.Order
        .where({
          id: orderId,
          organizationId,
        })
        .first();

    if (!order) {
      throw new NotFoundException(
        'Order not found',
      );
    }

    if (
      order.status !== 'PENDING' &&
      order.status !== 'CONFIRMED'
    ) {
      throw new BadRequestException(
        `Order cannot be cancelled (current: ${order.status})`,
      );
    }

    await db.transaction(async (tx) => {
      const updated =
        await tx.orm.public.Order
          .where({
            id: order.id,
            organizationId,
            status: order.status,
          })
          .update({
            status: 'CANCELLED',
          });

      if (!updated) {
        throw new ConflictException(
          'Order status changed, please retry',
        );
      }

      const reserves =
        await tx.orm.public.StockMovement
          .where({
            organizationId,
            referenceType: 'ORDER',
            referenceId: order.id,
          })
          .all();

      for (const r of reserves) {
        const stock =
          await tx.orm.public.InventoryStock
            .where({
              id: r.inventoryStockId,
            })
            .first();

        if (!stock) {
          throw new NotFoundException(
            'Inventory stock not found',
          );
        }

        const released =
          await tx.orm.public.InventoryStock
            .where({
              id: stock.id,
            })
            .update({
              reservedQuantity:
                Math.max(
                  0,
                  stock.reservedQuantity -
                    r.quantity,
                ),
            });

        if (!released) {
          throw new ConflictException(
            'Failed to release reserved stock',
          );
        }

        await tx.orm.public.StockMovement.create({
          organizationId,
          branchId: r.branchId,
          productVariantId:
            r.productVariantId,
          inventoryStockId:
            stock.id,

          type: 'ADJUSTMENT',
          quantity: -r.quantity,

          referenceType: 'ORDER_CANCEL',
          referenceId: order.id,

          note:
            `Released for ${order.orderNumber}`,
        });
      }
    });

    return this.getOrder(
      organizationId,
      order.id,
    );
  }

  async shipOrder(
    organizationId: number,
    orderId: number,
  ) {
    const order =
      await db.orm.public.Order
        .where({
          id: orderId,
          organizationId,
        })
        .first();

    if (!order) {
      throw new NotFoundException(
        'Order not found',
      );
    }

    if (order.status !== 'CONFIRMED') {
      throw new BadRequestException(
        `Only CONFIRMED orders can be shipped (current: ${order.status})`,
      );
    }

    const updated =
      await db.orm.public.Order
        .where({
          id: order.id,
          organizationId,
          status: 'CONFIRMED',
        })
        .update({
          status: 'SHIPPED',
        });

    if (!updated) {
      throw new ConflictException(
        'Order status changed, please retry',
      );
    }

    return this.getOrder(
      organizationId,
      order.id,
    );
  }

  async deliverOrder(
    organizationId: number,
    orderId: number,
  ) {
    const order =
      await db.orm.public.Order
        .where({
          id: orderId,
          organizationId,
        })
        .first();

    if (!order) {
      throw new NotFoundException(
        'Order not found',
      );
    }

    if (order.status !== 'SHIPPED') {
      throw new BadRequestException(
        `Only SHIPPED orders can be delivered (current: ${order.status})`,
      );
    }

    await db.transaction(async (tx) => {
      const updated =
        await tx.orm.public.Order
          .where({
            id: order.id,
            organizationId,
            status: 'SHIPPED',
          })
          .update({
            status: 'DELIVERED',
          });

      if (!updated) {
        throw new ConflictException(
          'Order status changed, please retry',
        );
      }

      const orderItems =
        await tx.orm.public.OrderItem
          .where({
            orderId: order.id,
          })
          .all();

      for (const item of orderItems) {
        const movements =
          await tx.orm.public.StockMovement
            .where({
              organizationId,
              referenceType: 'ORDER',
              referenceId: order.id,
              productVariantId:
                item.productVariantId,
            })
            .all();

        let remaining =
          item.quantity;

        for (const movement of movements) {
          if (remaining <= 0) {
            break;
          }

          const reservedQty =
            Math.min(
              remaining,
              movement.quantity,
            );

          const stock =
            await tx.orm.public.InventoryStock
              .where({
                id: movement.inventoryStockId,
              })
              .first();

          if (!stock) {
            throw new NotFoundException(
              `Inventory stock ${movement.inventoryStockId} not found`,
            );
          }

          if (
            stock.reservedQuantity <
            reservedQty
          ) {
            throw new ConflictException(
              `Invalid reserved stock state for product variant ${item.productVariantId}`,
            );
          }

          if (
            stock.quantity <
            reservedQty
          ) {
            throw new ConflictException(
              `Insufficient physical stock for product variant ${item.productVariantId}`,
            );
          }

          const stockUpdated =
            await tx.orm.public.InventoryStock
              .where({
                id: stock.id,
                quantity:
                  stock.quantity,
                reservedQuantity:
                  stock.reservedQuantity,
              })
              .update({
                quantity:
                  stock.quantity -
                  reservedQty,

                reservedQuantity:
                  stock.reservedQuantity -
                  reservedQty,
              });

          if (!stockUpdated) {
            throw new ConflictException(
              'Inventory changed while completing delivery, please retry',
            );
          }

          await tx.orm.public.StockMovement.create({
            organizationId,
            branchId:
              movement.branchId,
            productVariantId:
              movement.productVariantId,
            inventoryStockId:
              stock.id,

            type: 'OUT',
            quantity: -reservedQty,

            referenceType:
              'ORDER_DELIVERY',
            referenceId: order.id,

            note:
              `Sold for ${order.orderNumber}`,
          });

          remaining -= reservedQty;
        }

        if (remaining > 0) {
          throw new ConflictException(
            `Could not settle reserved stock for ${item.sku}`,
          );
        }
      }

      if (
        order.paymentMethod === 'COD' &&
        order.paymentStatus !== 'PAID'
      ) {
        await tx.orm.public.Payment.create({
          orderId: order.id,
          amount: order.grandTotal,
          currency: order.currency,
          status: 'PAID',
          method: 'COD',
        });

        const paymentUpdated =
          await tx.orm.public.Order
            .where({
              id: order.id,
              organizationId,
            })
            .update({
              paymentStatus: 'PAID',
            });

        if (!paymentUpdated) {
          throw new ConflictException(
            'Failed to update payment status',
          );
        }
      }
    });

    return this.getOrder(
      organizationId,
      order.id,
    );
  }

  async getOrder(
    organizationId: number,
    orderId: number,
  ) {
    const order =
      await db.orm.public.Order
        .where({
          id: orderId,
          organizationId,
        })
        .first();

    if (!order) {
      throw new NotFoundException(
        'Order not found',
      );
    }

    const items =
      await db.orm.public.OrderItem
        .where({
          orderId: order.id,
        })
        .all();

    return {
      ...order,
      items,
    };
  }

  async listOrders(
    organizationId: number,
  ) {
    return db.orm.public.Order
      .where({
        organizationId,
      })
      .all();
  }
}

