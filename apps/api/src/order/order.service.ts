import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Numeric } from '@prisma/orm-postgres/target/codec-types';
import { InvoiceService } from '../invoice/invoice.service.js';
import { db } from '../prisma/db.js';
import { RiskService } from '../risk/risk.service.js';
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
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly riskService: RiskService,
    private readonly invoiceService: InvoiceService,
  ) {}

  private async generateOrderNumber(): Promise<string> {
    const now = new Date();
    const datePart =
      String(now.getFullYear()) +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');

    const prefix = `ORD-${datePart}-`;

    // আগে এখানে পুরো Order টেবিল মেমরিতে আনা হতো। এখন শুধু আজকের সর্বশেষ
    // order-টা (১টা সারি) এনে তার নম্বর থেকে পরের নম্বর বানানো হয়।
    // দুটো order একসাথে একই নম্বর বানালে `orderNumber @unique` ডুপ্লিকেট
    // আটকায়, আর createOrder-এর retry লুপ নতুন করে চেষ্টা করে।
    const latest = await db.orm.public.Order
      .where((o) => o.orderNumber.like(`${prefix}%`))
      .orderBy((o) => o.id.desc())
      .first();

    const lastSeq = latest
      ? Number.parseInt(latest.orderNumber.slice(prefix.length), 10)
      : 0;

    const seq = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;

    return `${prefix}${String(seq).padStart(4, '0')}`;
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

   

    const riskAssessment =
      await this.riskService.assessOrderRisk(
        organizationId,
        customer.id,
        grandTotal,
      );

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
              riskLevel:
              riskAssessment.level,
            riskReason:
              riskAssessment.reasons,

            
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

        // একসাথে অনেক order এলে সবাই একই মুহূর্তে আবার চেষ্টা করলে বারবার
        // সংঘর্ষ হয়; তাই নম্বর-সংঘর্ষে সামান্য এলোমেলো বিরতি দিই
        if (isOrderNumberClash) {
          await new Promise((resolve) =>
            setTimeout(resolve, 15 + Math.random() * 45 * attempt),
          );
        }
      }
    }

    if (orderId === undefined) {
      throw new ConflictException(
        'Could not complete order after retries',
      );
    }

    // Order সফলভাবে তৈরি হওয়ার পর স্বয়ংক্রিয়ভাবে Invoice generate করা
    // হচ্ছে (idempotent — InvoiceService নিজেই duplicate আটকায়)। এটা
    // try/catch-এ wrapped রাখা হয়েছে ইচ্ছাকৃতভাবে — invoice generation
    // কোনো কারণে fail করলেও সেটা order-creation-কে fail করাবে না
    // (order already DB-তে commit হয়ে গেছে), শুধু log হবে। পরে staff
    // POST /invoices/generate/:orderId দিয়ে manually আবার try করতে
    // পারবে (route-টা আগে থেকেই আছে)।
    try {
      await this.invoiceService.generateForOrder(
        organizationId,
        orderId,
      );
    } catch (error) {
      this.logger.error(
        `Auto invoice generation failed for order ${orderId}`,
        error,
      );
    }

    return this.getOrder(
      organizationId,
      orderId,
    );
  }

  // Race-condition fix: আগে এই মেথডটা read (remaining balance) আর
  // write (Payment create + Order update) আলাদা, lock-ছাড়া step
  // হিসেবে করতো — দুইটা concurrent request একই remaining balance
  // দেখে দুইটাই pass করে overpayment করতে পারতো।
  //
  // এখন পুরো মেথডটা db.transaction()-এর ভেতরে, আর Payment insert
  // করার পরে একই transaction-এর ভেতরেই আবার পুরো ledger পড়ে total
  // paid হিসাব করা হচ্ছে (post-insert re-verify)। যদি সেই মুহূর্তে
  // দেখা যায় মোট paid amount grandTotal ছাড়িয়ে গেছে (মানে অন্য একটা
  // concurrent payment এর মধ্যেই commit হয়ে গেছে), পুরো transaction
  // ConflictException দিয়ে rollback হয় — Payment row-টাও বাতিল হয়ে
  // যায়, কোনো overpayment persist হয় না। Order.paymentStatus update-ও
  // আগের মতোই conditional (old paymentStatus match করলেই update হবে),
  // একই pattern যা createOrder/cancelOrder-এ আছে।
  //
  // বাইরে একটা retry loop আছে (createOrder-এর মতো) — কোনো attempt
  // ConflictException-এ rollback হলে fresh state দিয়ে আবার চেষ্টা হয়,
  // BadRequestException/NotFoundException হলে সাথে সাথে throw হয়ে যায়
  // (retry করার কিছু নেই, legit validation failure)।
  async createPayment(
    organizationId: number,
    orderId: number,
    dto: CreatePaymentDto,
  ) {
    if (dto.amount <= 0) {
      throw new BadRequestException(
        'Payment amount must be greater than zero',
      );
    }

    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        return await db.transaction(async (tx) => {
          const order =
            await tx.orm.public.Order
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

          // Prevent duplicate transaction ID — কিন্তু এই organization-এর
          // ভেতরেই শুধু। আগে এটা global ছিল (শুধু transactionId দিয়ে
          // খুঁজতো, organizationId ছাড়া), তাই দুই আলাদা org একই
          // transactionId স্ট্রিং ব্যবহার করলে একটার legit payment
          // আরেকটার পুরনো entry-এর কারণে ভুলভাবে block হয়ে যেত। এখন
          // Payment model-এ নিজস্ব organizationId কলাম আছে, তাই সরাসরি
          // সেটা দিয়েই query করা হচ্ছে (আগের মতো Order-এর মাধ্যমে
          // join করে ঘুরপথে বের করার দরকার নেই)।
          if (dto.transactionId) {
            const existingPayment =
              await tx.orm.public.Payment
                .where({
                  organizationId,
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
            await tx.orm.public.Payment
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
            await tx.orm.public.Payment.create({
              organizationId,
              orderId: order.id,
              amount: money(dto.amount),
              currency: order.currency,
              status: 'PAID',
              method: dto.method,
              transactionId:
                dto.transactionId ??
                undefined,
            });

          // --- Post-insert re-verify (এই transaction-এর ভেতরেই) ---
          // এই পয়েন্টে অন্য কোনো concurrent payment ইতিমধ্যে commit
          // হয়ে গেলে, এই SELECT-এ সেটাও দেখা যাবে (read-committed হলেও
          // committed row সবসময় visible)। তাই এখানে ধরা পড়লে পুরো
          // transaction বাতিল হয়ে retry হবে।
          const allPayments =
            await tx.orm.public.Payment
              .where({
                orderId: order.id,
              })
              .all();

          const totalPaidNow =
            allPayments
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

          if (totalPaidNow > orderTotal + 0.01) {
            throw new ConflictException(
              'Concurrent payment detected, please retry',
            );
          }

          const updated =
            await tx.orm.public.Order
              .where({
                id: order.id,
                organizationId,
                paymentStatus:
                  order.paymentStatus,
              })
              .update({
                paymentStatus:
                  totalPaidNow >= orderTotal
                    ? 'PAID'
                    : 'PENDING',
              });

          if (!updated) {
            throw new ConflictException(
              'Order payment status changed concurrently, please retry',
            );
          }

          return payment;
        });
      } catch (error) {
        if (
          error instanceof
            BadRequestException ||
          error instanceof
            NotFoundException
        ) {
          throw error;
        }

        const isConflict =
          error instanceof
          ConflictException;

        if (
          !isConflict ||
          attempt === 5
        ) {
          throw error;
        }
        // ConflictException + attempt বাকি আছে → লুপ চালিয়ে retry
      }
    }

    throw new ConflictException(
      'Could not record payment after retries',
    );
  }

  // Partial Payment (COD advance): একটা COD order PENDING থেকে CONFIRMED-এ
  // নেওয়ার আগে অন্তত shipping charge-টা advance হিসেবে পেইড থাকতে হবে।
  // এটা fake/prank COD order ঠেকানোর জন্য — কুরিয়ার চার্জটা আগেই
  // নিশ্চিত হয়ে গেলে গ্রাহক সহজে অর্ডার ক্যানসেল/রিজেক্ট করবে না।
  private async getPaidAmount(
    organizationId: number,
    orderId: number,
  ): Promise<number> {
    const payments =
      await db.orm.public.Payment
        .where({
          organizationId,
          orderId,
        })
        .all();

    return payments
      .filter(
        (payment) =>
          payment.status === 'PAID' ||
          payment.status === 'AUTHORIZED',
      )
      .reduce(
        (total, payment) =>
          total + Number(payment.amount),
        0,
      );
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

    // COD order হলে অন্তত shipping charge-টা advance হিসেবে paid থাকতে
    // হবে, নাহলে confirm করা যাবে না — fake order ঠেকানোর ব্যবস্থা।
    if (order.paymentMethod === 'COD') {
      const paidAmount =
        await this.getPaidAmount(
          organizationId,
          order.id,
        );

      const requiredAdvance =
        Number(order.shippingTotal);

      if (paidAmount < requiredAdvance) {
        throw new BadRequestException(
          `COD order requires an advance payment of at least ${requiredAdvance.toFixed(2)} (courier charge) before it can be confirmed. Advance paid so far: ${paidAmount.toFixed(2)}`,
        );
      }
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

    // PROCESSING-কেও allow করা হচ্ছে — আগে শুধু PENDING/CONFIRMED cancel
    // করা যেত, কিন্তু shipOrder() শুধু PROCESSING status থেকেই ship
    // accept করে। তাই PROCESSING-এ cancel না থাকলে order একবার
    // PROCESSING-এ গেলে ship করা ছাড়া কোনো exit থাকতো না (dead-end)।
    // Stock এখনো শুধু reserve অবস্থায় আছে (finalize হয় deliverOrder-এ),
    // তাই নিচের release-logic অপরিবর্তিত রেখেই PROCESSING থেকে cancel
    // করা নিরাপদ।
    if (
      order.status !== 'PENDING' &&
      order.status !== 'CONFIRMED' &&
      order.status !== 'PROCESSING'
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

    if (order.status !== 'PROCESSING') {
      throw new BadRequestException(
        `Only PROCESSING orders can be shipped (current: ${order.status})`,
      );
    }

    const updated =
      await db.orm.public.Order
        .where({
          id: order.id,
          organizationId,
          status: 'PROCESSING',
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

  async processOrder(
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
        `Only CONFIRMED orders can move to processing (current: ${order.status})`,
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
          status: 'PROCESSING',
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
        // আগে এখানে পুরো order.grandTotal বসানো হতো — কিন্তু delivery-র
        // আগে যদি কোনো advance/partial payment (createPayment দিয়ে)
        // রেকর্ড করা থাকে, তাহলে paymentStatus এখনো 'PAID' না হওয়া
        // সত্ত্বেও সেই advance-টা grandTotal-এর অংশ। পুরো grandTotal
        // আবার COD payment হিসেবে বসালে টাকা ডাবল হয়ে যেত। তাই এখন
        // remaining balance (grandTotal - আগের paid payments) বসানো
        // হচ্ছে।
        const existingPayments =
          await tx.orm.public.Payment
            .where({
              orderId: order.id,
            })
            .all();

        const alreadyPaid =
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
          Math.max(
            0,
            orderTotal - alreadyPaid,
          );

        if (remainingAmount > 0) {
          await tx.orm.public.Payment.create({
            organizationId,
            orderId: order.id,
            amount: money(remainingAmount),
            currency: order.currency,
            status: 'PAID',
            method: 'COD',
          });
        }

        const paymentUpdated =
          await tx.orm.public.Order
            .where({
              id: order.id,
              organizationId,
              paymentStatus:
                order.paymentStatus,
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

  async returnOrder(
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

    if (order.status !== 'DELIVERED') {
      throw new BadRequestException(
        `Only DELIVERED orders can be returned (current: ${order.status})`,
      );
    }

    await db.transaction(async (tx) => {
      const updated =
        await tx.orm.public.Order
          .where({
            id: order.id,
            organizationId,
            status: 'DELIVERED',
          })
          .update({
            status: 'RETURNED',
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
              referenceType: 'ORDER_DELIVERY',
              referenceId: order.id,
              productVariantId:
                item.productVariantId,
            })
            .all();

        for (const movement of movements) {
          const stock =
            await tx.orm.public.InventoryStock
              .where({
                id: movement.inventoryStockId,
              })
              .first();

          if (!stock) {
            continue;
          }

          const returnQty =
            Math.abs(movement.quantity);

          const stockUpdated =
            await tx.orm.public.InventoryStock
              .where({
                id: stock.id,
                quantity: stock.quantity,
              })
              .update({
                quantity:
                  stock.quantity + returnQty,
              });

          if (!stockUpdated) {
            throw new ConflictException(
              'Inventory changed while processing return, please retry',
            );
          }

          await tx.orm.public.StockMovement.create({
            organizationId,
            branchId: movement.branchId,
            productVariantId:
              movement.productVariantId,
            inventoryStockId: stock.id,

            type: 'RETURN_IN',
            quantity: returnQty,

            referenceType: 'ORDER_RETURN',
            referenceId: order.id,

            note:
              `Returned from ${order.orderNumber}`,
          });
        }
      }

      if (order.paymentStatus === 'PAID') {
        // আগে এখানে শুধু paymentStatus flag বদলানো হতো, কোনো Payment
        // audit row তৈরি হতো না — কত টাকা কবে ফেরত দেওয়া হলো তার কোনো
        // ট্র্যাক থাকতো না। এখন negative-amount একটা Payment row তৈরি
        // হচ্ছে, status 'REFUNDED', যাতে ledger-এ refund-টাও দেখা যায়।
        const existingPayments =
          await tx.orm.public.Payment
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

        if (paidAmount > 0) {
          await tx.orm.public.Payment.create({
            organizationId,
            orderId: order.id,
            amount: money(-paidAmount),
            currency: order.currency,
            status: 'REFUNDED',
            method: order.paymentMethod,
          });
        }

        const paymentUpdated =
          await tx.orm.public.Order
            .where({
              id: order.id,
              organizationId,
              paymentStatus:
                order.paymentStatus,
            })
            .update({
              paymentStatus: 'REFUNDED',
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
  customerIds?: number[] | null,
) {
  const orders =
    await db.orm.public.Order
      .where({
        organizationId,
      })
      .all();

  if (!customerIds) {
    return orders;
  }

  return orders.filter(
    (order) =>
      order.customerId != null &&
      customerIds.includes(order.customerId),
  );
}
}