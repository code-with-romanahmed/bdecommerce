import { randomUUID } from 'node:crypto';

import type Redis from 'ioredis';

import type { AuthUser } from '../auth/auth.types.js';
import type { OrderAccessService } from '../order/order-access.service.js';
import type { OrderService } from '../order/order.service.js';
import { db } from '../prisma/db.js';
import type { RbacService } from '../rbac/rbac.service.js';

// =====================================================================
// Customer tools
// (আগে থেকেই customerId দিয়ে server-side scoped, তাই এখানে পরিবর্তন নেই)
// =====================================================================

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
    const products = await db.orm.public.Product
      .where({ organizationId, status: 'ACTIVE' })
      .all();

    const queryLower = String(input?.query ?? '').toLowerCase();

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

// =====================================================================
// Staff tools
//
// নিরাপত্তার নিয়ম (REST API-র সাথে হুবহু একই access rule):
//  1. প্রতিটি order-ভিত্তিক tool OrderAccessService.canAccessOrder() দিয়ে
//     চেক করে — CASHIER শুধু assigned customer-এর order পাবে।
//  2. update_order_status সরাসরি কাজ করে না। এটা শুধু একটা "pending
//     action" তৈরি করে (Redis-এ, ৫ মিনিট, একবার ব্যবহারযোগ্য)। আসল কাজ
//     হয় শুধু যখন ব্যবহারকারী নিজে confirmActionId পাঠায় (UI-র বাটন) —
//     LLM নিজে এটা নিশ্চিত করতে পারে না।
//  3. sales_summary শুধু SUPER_ADMIN/ADMIN/MANAGER, check_inventory শুধু
//     inventory.read permission থাকলে।
// =====================================================================

export const ORDER_ACTIONS = [
  'confirm',
  'process',
  'ship',
  'deliver',
  'cancel',
  'return',
] as const;

export type OrderAction = (typeof ORDER_ACTIONS)[number];

const PENDING_ACTION_TTL_SECONDS = 5 * 60;

export interface StaffToolContext {
  user: AuthUser;
  organizationId: number;
  orderService: OrderService;
  orderAccess: OrderAccessService;
  rbac: RbacService;
  redis: Redis;
}

export interface StaffToolOptions {
  canViewSales: boolean;
  canViewInventory: boolean;
}

export interface PendingOrderAction {
  actionId: string;
  orderNumber: string;
  action: OrderAction;
  currentStatus: string;
}

interface StoredPendingAction {
  organizationId: number;
  orderId: number;
  orderNumber: string;
  action: OrderAction;
}

export type ConfirmOutcome =
  | { success: true; orderNumber: string; action: OrderAction; status: string }
  | { success: false; error: string };

const ORDER_NOT_FOUND_OR_DENIED =
  'Order পাওয়া যায়নি, অথবা এই order-এ আপনার access নেই';

function pendingKey(userId: number, actionId: string): string {
  return `agent:pending:${userId}:${actionId}`;
}

export async function getStaffToolOptions(
  user: AuthUser,
  rbac: RbacService,
): Promise<StaffToolOptions> {
  const { id, organizationId } = user;

  const [isSuperAdmin, isAdmin, isManager, canViewInventory] =
    await Promise.all([
      rbac.hasRole(id, organizationId, 'SUPER_ADMIN'),
      rbac.hasRole(id, organizationId, 'ADMIN'),
      rbac.hasRole(id, organizationId, 'MANAGER'),
      rbac.hasPermission(id, organizationId, 'inventory.read'),
    ]);

  return {
    canViewSales: isSuperAdmin || isAdmin || isManager,
    canViewInventory,
  };
}

export function buildStaffTools(options: StaffToolOptions) {
  const tools: any[] = [
    {
      name: 'find_order',
      description:
        'Order number দিয়ে order খুঁজে বের করো (পুরো detail সহ)। শুধু যে order-এ ব্যবহারকারীর access আছে সেটাই পাওয়া যাবে।',
      input_schema: {
        type: 'object' as const,
        properties: { orderNumber: { type: 'string' } },
        required: ['orderNumber'],
      },
    },
    {
      name: 'update_order_status',
      description:
        'Order-এর status পরিবর্তনের অনুরোধ তৈরি করো। action হতে পারে: confirm, process, ship, deliver, cancel, return। এটা সঙ্গে সঙ্গে কার্যকর হয় না — ব্যবহারকারী নিশ্চিত না করা পর্যন্ত কিছুই বদলায় না।',
      input_schema: {
        type: 'object' as const,
        properties: {
          orderId: { type: 'number' },
          action: {
            type: 'string',
            enum: [...ORDER_ACTIONS],
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
  ];

  if (options.canViewInventory) {
    tools.push({
      name: 'check_inventory',
      description: 'SKU দিয়ে একটা প্রোডাক্টের stock অবস্থা (প্রতি branch) দেখাও।',
      input_schema: {
        type: 'object' as const,
        properties: { sku: { type: 'string' } },
        required: ['sku'],
      },
    });
  }

  if (options.canViewSales) {
    tools.push({
      name: 'sales_summary',
      description: 'গত N দিনের total order সংখ্যা, total revenue, status-wise breakdown দেখাও।',
      input_schema: {
        type: 'object' as const,
        properties: { days: { type: 'number', description: 'ডিফল্ট ৭, সর্বোচ্চ ৯০' } },
        required: [],
      },
    });
  }

  return tools;
}

// order আছে কি না + এই user-এর access আছে কি না — দুটোই একসাথে।
async function loadAccessibleOrder(
  ctx: StaffToolContext,
  where: { id?: number; orderNumber?: string },
) {
  const order = await db.orm.public.Order
    .where({ organizationId: ctx.organizationId, ...where })
    .first();

  if (!order) {
    return null;
  }

  const allowed = await ctx.orderAccess.canAccessOrder(ctx.user, order);

  return allowed ? order : null;
}

function runOrderAction(
  ctx: StaffToolContext,
  action: OrderAction,
  orderId: number,
): Promise<any> {
  const { orderService, organizationId } = ctx;

  switch (action) {
    case 'confirm':
      return orderService.confirmOrder(organizationId, orderId);
    case 'process':
      return orderService.processOrder(organizationId, orderId);
    case 'ship':
      return orderService.shipOrder(organizationId, orderId);
    case 'deliver':
      return orderService.deliverOrder(organizationId, orderId);
    case 'cancel':
      return orderService.cancelOrder(organizationId, orderId);
    case 'return':
      return orderService.returnOrder(organizationId, orderId);
  }
}

// ---------------------------------------------------------------------
// ব্যবহারকারী নিজে বাটন চেপে নিশ্চিত করলে এটা চলে (LLM-এর বাইরে)।
// Pending action একবারই ব্যবহার করা যায় (get + del একসাথে, atomic)।
// ---------------------------------------------------------------------
export async function confirmPendingOrderAction(
  ctx: StaffToolContext,
  actionId: string,
): Promise<ConfirmOutcome> {
  const key = pendingKey(ctx.user.id, actionId);

  const results = await ctx.redis.multi().get(key).del(key).exec();
  const raw = results?.[0]?.[1];

  if (typeof raw !== 'string') {
    return {
      success: false,
      error: 'এই action-টির মেয়াদ শেষ হয়ে গেছে বা আগেই ব্যবহার হয়েছে। আবার অনুরোধ করুন।',
    };
  }

  let pending: StoredPendingAction;
  try {
    pending = JSON.parse(raw) as StoredPendingAction;
  } catch {
    return { success: false, error: 'Action পড়া যায়নি' };
  }

  if (pending.organizationId !== ctx.organizationId) {
    return { success: false, error: ORDER_NOT_FOUND_OR_DENIED };
  }

  // নিশ্চিত করার মুহূর্তে access আবার চেক (এর মধ্যে assignment বদলাতে পারে)
  const order = await loadAccessibleOrder(ctx, { id: pending.orderId });

  if (!order) {
    return { success: false, error: ORDER_NOT_FOUND_OR_DENIED };
  }

  try {
    const result = await runOrderAction(ctx, pending.action, order.id);

    return {
      success: true,
      orderNumber: pending.orderNumber,
      action: pending.action,
      status: String(result?.status ?? ''),
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Status update ব্যর্থ হয়েছে',
    };
  }
}

export async function executeStaffTool(
  toolName: string,
  input: any,
  ctx: StaffToolContext,
): Promise<string> {
  if (toolName === 'find_order') {
    const orderNumber = String(input?.orderNumber ?? '');
    const order = await loadAccessibleOrder(ctx, { orderNumber });

    if (!order) return JSON.stringify({ error: ORDER_NOT_FOUND_OR_DENIED });

    const items = await db.orm.public.OrderItem.where({ orderId: order.id }).all();

    return JSON.stringify({ ...order, items });
  }

  if (toolName === 'update_order_status') {
    const orderId = Number(input?.orderId);
    const action = input?.action as OrderAction;

    if (!Number.isInteger(orderId) || !ORDER_ACTIONS.includes(action)) {
      return JSON.stringify({ error: 'orderId বা action সঠিক নয়' });
    }

    const order = await loadAccessibleOrder(ctx, { id: orderId });

    if (!order) return JSON.stringify({ error: ORDER_NOT_FOUND_OR_DENIED });

    // এখানে কিছুই বদলায় না — শুধু pending action তৈরি হয়।
    const actionId = randomUUID();

    const stored: StoredPendingAction = {
      organizationId: ctx.organizationId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      action,
    };

    await ctx.redis.set(
      pendingKey(ctx.user.id, actionId),
      JSON.stringify(stored),
      'EX',
      PENDING_ACTION_TTL_SECONDS,
    );

    return JSON.stringify({
      pendingConfirmation: true,
      actionId,
      orderNumber: order.orderNumber,
      currentStatus: order.status,
      action,
      note: 'এখনো কিছু বদলায়নি। ব্যবহারকারী নিশ্চিত করলেই কার্যকর হবে।',
    });
  }

  if (toolName === 'explain_risk') {
    const orderId = Number(input?.orderId);

    if (!Number.isInteger(orderId)) {
      return JSON.stringify({ error: 'orderId সঠিক নয়' });
    }

    const order = await loadAccessibleOrder(ctx, { id: orderId });

    if (!order) return JSON.stringify({ error: ORDER_NOT_FOUND_OR_DENIED });

    return JSON.stringify({
      riskLevel: order.riskLevel,
      riskReason: order.riskReason,
    });
  }

  if (toolName === 'check_inventory') {
    const options = await getStaffToolOptions(ctx.user, ctx.rbac);

    if (!options.canViewInventory) {
      return JSON.stringify({ error: 'Inventory দেখার অনুমতি নেই' });
    }

    const variant = await db.orm.public.ProductVariant
      .where({ organizationId: ctx.organizationId, sku: String(input?.sku ?? '') })
      .first();

    if (!variant) return JSON.stringify({ error: 'SKU পাওয়া যায়নি' });

    const stocks = await db.orm.public.InventoryStock
      .where({ organizationId: ctx.organizationId, productVariantId: variant.id })
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
    const options = await getStaffToolOptions(ctx.user, ctx.rbac);

    if (!options.canViewSales) {
      return JSON.stringify({ error: 'Sales summary দেখার অনুমতি নেই' });
    }

    const requestedDays = Number(input?.days ?? 7);
    const days = Number.isFinite(requestedDays)
      ? Math.min(Math.max(Math.trunc(requestedDays), 1), 90)
      : 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const orders = await db.orm.public.Order
      .where({ organizationId: ctx.organizationId })
      .all();

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