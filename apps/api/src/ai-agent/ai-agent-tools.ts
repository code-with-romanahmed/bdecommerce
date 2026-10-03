// import { OrderService } from '../order/order.service.js';
// import { db } from '../prisma/db.js';

// // ---------- Customer tools ----------

// export function buildCustomerTools() {
//   return [
//     {
//       name: 'check_order_status',
//       description:
//         'নির্দিষ্ট order number দিয়ে order-এর বর্তমান status, items, এবং payment status দেখাও। শুধু নিজের order-ই দেখা যাবে।',
//       input_schema: {
//         type: 'object' as const,
//         properties: {
//           orderNumber: { type: 'string', description: 'যেমন ORD-20261001-0001' },
//         },
//         required: ['orderNumber'],
//       },
//     },
//     {
//       name: 'search_products',
//       description: 'নাম দিয়ে প্রোডাক্ট খোঁজো।',
//       input_schema: {
//         type: 'object' as const,
//         properties: {
//           query: { type: 'string' },
//         },
//         required: ['query'],
//       },
//     },
//   ];
// }

// export async function executeCustomerTool(
//   toolName: string,
//   input: any,
//   organizationId: number,
//   customerId: number,
// ): Promise<string> {
//   if (toolName === 'check_order_status') {
//     const order = await db.orm.public.Order
//       .where({ organizationId, orderNumber: input.orderNumber, customerId })
//       .first();

//     if (!order) {
//       return JSON.stringify({ error: 'এই order number-এর কোনো অর্ডার পাওয়া যায়নি আপনার account-এ।' });
//     }

//     const items = await db.orm.public.OrderItem.where({ orderId: order.id }).all();

//     return JSON.stringify({
//       orderNumber: order.orderNumber,
//       status: order.status,
//       paymentStatus: order.paymentStatus,
//       grandTotal: order.grandTotal,
//       items: items.map((i) => ({ name: i.productName, qty: i.quantity })),
//     });
//   }

//   if (toolName === 'search_products') {
//     const products = await db.orm.public.Product
//       .where({ organizationId, status: 'ACTIVE' })
//       .all();

//     const matches = products
//       .filter((p) => p.name.toLowerCase().includes(input.query.toLowerCase()))
//       .slice(0, 5);

//     return JSON.stringify(
//       matches.map((p) => ({ name: p.name, slug: p.slug })),
//     );
//   }

//   return JSON.stringify({ error: 'Unknown tool' });
// }

// // ---------- Staff tools ----------

// export function buildStaffTools() {
//   return [
//     {
//       name: 'find_order',
//       description: 'Order number দিয়ে যেকোনো customer-এর order খুঁজে বের করো (পুরো detail সহ)।',
//       input_schema: {
//         type: 'object' as const,
//         properties: { orderNumber: { type: 'string' } },
//         required: ['orderNumber'],
//       },
//     },
//     {
//       name: 'update_order_status',
//       description:
//         'Order-এর status পরিবর্তন করো। action হতে পারে: confirm, process, ship, deliver, cancel, return।',
//       input_schema: {
//         type: 'object' as const,
//         properties: {
//           orderId: { type: 'number' },
//           action: {
//             type: 'string',
//             enum: ['confirm', 'process', 'ship', 'deliver', 'cancel', 'return'],
//           },
//         },
//         required: ['orderId', 'action'],
//       },
//     },
//     {
//       name: 'explain_risk',
//       description: 'একটা order কেন HIGH/MEDIUM risk-flagged হয়েছে তার কারণ দেখাও।',
//       input_schema: {
//         type: 'object' as const,
//         properties: { orderId: { type: 'number' } },
//         required: ['orderId'],
//       },
//     },
//     {
//       name: 'check_inventory',
//       description: 'SKU দিয়ে একটা প্রোডাক্টের stock অবস্থা (প্রতি branch) দেখাও।',
//       input_schema: {
//         type: 'object' as const,
//         properties: { sku: { type: 'string' } },
//         required: ['sku'],
//       },
//     },
//     {
//       name: 'sales_summary',
//       description: 'গত N দিনের total order সংখ্যা, total revenue, status-wise breakdown দেখাও।',
//       input_schema: {
//         type: 'object' as const,
//         properties: { days: { type: 'number', description: 'ডিফল্ট ৭' } },
//         required: [],
//       },
//     },
//   ];
// }

// export async function executeStaffTool(
//   toolName: string,
//   input: any,
//   organizationId: number,
//   orderService: OrderService,
// ): Promise<string> {
//   if (toolName === 'find_order') {
//     const order = await db.orm.public.Order
//       .where({ organizationId, orderNumber: input.orderNumber })
//       .first();

//     if (!order) return JSON.stringify({ error: 'Order পাওয়া যায়নি' });

//     const items = await db.orm.public.OrderItem.where({ orderId: order.id }).all();

//     return JSON.stringify({ ...order, items });
//   }

//   if (toolName === 'update_order_status') {
//     try {
//       const actionMap: Record<string, (orgId: number, id: number) => Promise<any>> = {
//         confirm: orderService.confirmOrder.bind(orderService),
//         process: orderService.processOrder.bind(orderService),
//         ship: orderService.shipOrder.bind(orderService),
//         deliver: orderService.deliverOrder.bind(orderService),
//         cancel: orderService.cancelOrder.bind(orderService),
//         return: orderService.returnOrder.bind(orderService),
//       };

//       const fn = actionMap[input.action];
//       if (!fn) return JSON.stringify({ error: 'Unknown action' });

//       const result = await fn(organizationId, input.orderId);
//       return JSON.stringify({ success: true, status: result.status });
//     } catch (error) {
//       return JSON.stringify({
//         error: error instanceof Error ? error.message : 'Status update ব্যর্থ হয়েছে',
//       });
//     }
//   }

//   if (toolName === 'explain_risk') {
//     const order = await db.orm.public.Order
//       .where({ id: input.orderId, organizationId })
//       .first();

//     if (!order) return JSON.stringify({ error: 'Order পাওয়া যায়নি' });

//     return JSON.stringify({
//       riskLevel: order.riskLevel,
//       riskReason: order.riskReason,
//     });
//   }

//   if (toolName === 'check_inventory') {
//     const variant = await db.orm.public.ProductVariant
//       .where({ organizationId, sku: input.sku })
//       .first();

//     if (!variant) return JSON.stringify({ error: 'SKU পাওয়া যায়নি' });

//     const stocks = await db.orm.public.InventoryStock
//       .where({ organizationId, productVariantId: variant.id })
//       .all();

//     return JSON.stringify(
//       stocks.map((s) => ({
//         branchId: s.branchId,
//         quantity: s.quantity,
//         reserved: s.reservedQuantity,
//         available: s.quantity - s.reservedQuantity,
//       })),
//     );
//   }

//   if (toolName === 'sales_summary') {
//     const days = input.days ?? 7;
//     const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

//     const orders = await db.orm.public.Order.where({ organizationId }).all();
//     const recent = orders.filter((o) => new Date(o.createdAt) >= since);

//     const byStatus: Record<string, number> = {};
//     let revenue = 0;

//     for (const o of recent) {
//       byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
//       if (o.status !== 'CANCELLED') revenue += Number(o.grandTotal);
//     }

//     return JSON.stringify({
//       days,
//       totalOrders: recent.length,
//       totalRevenue: revenue.toFixed(2),
//       byStatus,
//     });
//   }

//   return JSON.stringify({ error: 'Unknown tool' });
// }


import { OrderService } from '../order/order.service.js';
import { db } from '../prisma/db.js';

// ---------- Customer tools ----------

export function buildCustomerTools() {
  return [
    {
      name: 'check_order_status',
      description:
        'নির্দিষ্ট order number দিয়ে order-এর বর্তমান status, items, এবং payment status দেখাও। শুধু নিজের order-ই দেখা যাবে।',
      input_schema: {
        type: 'object' as const,
        properties: {
          orderNumber: { type: 'string', description: 'যেমন ORD-20261001-0001' },
        },
        required: ['orderNumber'],
      },
    },
    {
      name: 'search_products',
      description: 'নাম দিয়ে প্রোডাক্ট খোঁজো।',
      input_schema: {
        type: 'object' as const,
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    },
  ];
}

export async function executeCustomerTool(
  toolName: string,
  input: any,
  organizationId: number,
  customerId: number,
): Promise<string> {
  if (toolName === 'check_order_status') {
    const order = await db.orm.public.Order
      .where({ organizationId, orderNumber: input.orderNumber, customerId })
      .first();

    if (!order) {
      return JSON.stringify({ error: 'এই order number-এর কোনো অর্ডার পাওয়া যায়নি আপনার account-এ।' });
    }

    const items = await db.orm.public.OrderItem.where({ orderId: order.id }).all();

    return JSON.stringify({
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      grandTotal: order.grandTotal,
      items: items.map((i) => ({ name: i.productName, qty: i.quantity })),
    });
  }

  if (toolName === 'search_products') {
    // 💡 আপনার আসল ORM সিনট্যাক্স ঠিক রেখে শুধু লুপ ও লিমিট অপটিমাইজ করা হয়েছে
    const products = await db.orm.public.Product
      .where({ organizationId, status: 'ACTIVE' })
      .all();

    const queryLower = (input.query ?? '').toLowerCase();
    
    // খুঁজে পাওয়া মাত্র প্রথম ৫টি নিয়ে লুপ থামিয়ে দেবে (DB ও CPU এর চাপ কমবে)
    const matches: { name: string; slug: string }[] = [];
    for (const p of products) {
      if (p.name.toLowerCase().includes(queryLower)) {
        matches.push({ name: p.name, slug: p.slug });
        if (matches.length >= 5) break;
      }
    }

    return JSON.stringify(matches);
  }

  return JSON.stringify({ error: 'Unknown tool' });
}

// ---------- Staff tools ----------

export function buildStaffTools() {
  return [
    {
      name: 'find_order',
      description: 'Order number দিয়ে যেকোনো customer-এর order খুঁজে বের করো (পুরো detail সহ)।',
      input_schema: {
        type: 'object' as const,
        properties: { orderNumber: { type: 'string' } },
        required: ['orderNumber'],
      },
    },
    {
      name: 'update_order_status',
      description:
        'Order-এর status পরিবর্তন করো। action হতে পারে: confirm, process, ship, deliver, cancel, return।',
      input_schema: {
        type: 'object' as const,
        properties: {
          orderId: { type: 'number' },
          action: {
            type: 'string',
            enum: ['confirm', 'process', 'ship', 'deliver', 'cancel', 'return'],
          },
        },
        required: ['orderId', 'action'],
      },
    },
    {
      name: 'explain_risk',
      description: 'একটা order কেন HIGH/MEDIUM risk-flagged হয়েছে তার কারণ দেখাও।',
      input_schema: {
        type: 'object' as const,
        properties: { orderId: { type: 'number' } },
        required: ['orderId'],
      },
    },
    {
      name: 'check_inventory',
      description: 'SKU দিয়ে একটা প্রোডাক্টের stock অবস্থা (প্রতি branch) দেখাও।',
      input_schema: {
        type: 'object' as const,
        properties: { sku: { type: 'string' } },
        required: ['sku'],
      },
    },
    {
      name: 'sales_summary',
      description: 'গত N দিনের total order সংখ্যা, total revenue, status-wise breakdown দেখাও।',
      input_schema: {
        type: 'object' as const,
        properties: { days: { type: 'number', description: 'ডিফল্ট ৭' } },
        required: [],
      },
    },
  ];
}

export async function executeStaffTool(
  toolName: string,
  input: any,
  organizationId: number,
  orderService: OrderService,
): Promise<string> {
  if (toolName === 'find_order') {
    const order = await db.orm.public.Order
      .where({ organizationId, orderNumber: input.orderNumber })
      .first();

    if (!order) return JSON.stringify({ error: 'Order পাওয়া যায়নি' });

    const items = await db.orm.public.OrderItem.where({ orderId: order.id }).all();

    return JSON.stringify({ ...order, items });
  }

  if (toolName === 'update_order_status') {
    try {
      const actionMap: Record<string, (orgId: number, id: number) => Promise<any>> = {
        confirm: orderService.confirmOrder.bind(orderService),
        process: orderService.processOrder.bind(orderService),
        ship: orderService.shipOrder.bind(orderService),
        deliver: orderService.deliverOrder.bind(orderService),
        cancel: orderService.cancelOrder.bind(orderService),
        return: orderService.returnOrder.bind(orderService),
      };

      const fn = actionMap[input.action];
      if (!fn) return JSON.stringify({ error: 'Unknown action' });

      const result = await fn(organizationId, input.orderId);
      return JSON.stringify({ success: true, status: result.status });
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : 'Status update ব্যর্থ হয়েছে',
      });
    }
  }

  if (toolName === 'explain_risk') {
    const order = await db.orm.public.Order
      .where({ id: input.orderId, organizationId })
      .first();

    if (!order) return JSON.stringify({ error: 'Order পাওয়া যায়নি' });

    return JSON.stringify({
      riskLevel: order.riskLevel,
      riskReason: order.riskReason,
    });
  }

  if (toolName === 'check_inventory') {
    const variant = await db.orm.public.ProductVariant
      .where({ organizationId, sku: input.sku })
      .first();

    if (!variant) return JSON.stringify({ error: 'SKU পাওয়া যায়নি' });

    const stocks = await db.orm.public.InventoryStock
      .where({ organizationId, productVariantId: variant.id })
      .all();

    return JSON.stringify(
      stocks.map((s) => ({
        branchId: s.branchId,
        quantity: s.quantity,
        reserved: s.reservedQuantity,
        available: s.quantity - s.reservedQuantity,
      })),
    );
  }

  if (toolName === 'sales_summary') {
    const days = input.days ?? 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const orders = await db.orm.public.Order.where({ organizationId }).all();
    
    // 💡 তারিখ ফিল্টারিং সামান্য ক্লিন করা হলো
    const byStatus: Record<string, number> = {};
    let revenue = 0;
    let count = 0;

    for (const o of orders) {
      if (new Date(o.createdAt) >= since) {
        count++;
        byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
        if (o.status !== 'CANCELLED') revenue += Number(o.grandTotal);
      }
    }

    return JSON.stringify({
      days,
      totalOrders: count,
      totalRevenue: revenue.toFixed(2),
      byStatus,
    });
  }

  return JSON.stringify({ error: 'Unknown tool' });
}