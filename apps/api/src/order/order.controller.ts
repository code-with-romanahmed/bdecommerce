import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationId } from '../auth/organization-context.decorator.js';
import { RequirePermission } from '../rbac/permission.decorator.js';
import { PermissionGuard } from '../rbac/permission.guard.js';
import { OrderAccessGuard } from './order-access.guard.js';
import { OrderAccessService } from './order-access.service.js';
import { CreateOrderDto, CreatePaymentDto } from './order.dto.js';
import { OrderService } from './order.service.js';

// গেটওয়ে-যাচাই ছাড়া এই মাধ্যমগুলোর পেমেন্ট হাতে রেকর্ড করা নিষিদ্ধ
// (শুধু payment.override থাকা ইউজার পারে)। COD/OTHER কাউন্টারে নগদের জন্য খোলা।
const ONLINE_METHODS = ['BKASH', 'NAGAD', 'ROCKET', 'CARD'];

@Controller('orders')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly orderAccess: OrderAccessService,
  ) {}

  // Hybrid (POS + E-commerce) order তৈরি:
  //  - CUSTOMER: customerId সবসময় নিজের (অন্যেরটা দিলে 403), কোনো discount নয়
  //  - ADMIN/MANAGER: যেকোনো customer; CASHIER: শুধু assigned customer
  //  - Discount: OrderAccessService.getDiscountPolicy অনুযায়ী
  @Post()
  @RequirePermission('order.create')
  async createOrder(
    @OrganizationId() organizationId: number,
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateOrderDto,
  ) {
    const user = request.authUser!;

    let customerId: number | undefined = dto.customerId;

    const ownCustomerId = await this.orderAccess.getOwnCustomerId(user);

    if (ownCustomerId !== null) {
      if (customerId !== undefined && customerId !== ownCustomerId) {
        throw new ForbiddenException(
          'You can only place orders for your own account',
        );
      }

      customerId = ownCustomerId;
    }

    if (customerId === undefined) {
      throw new BadRequestException('customerId is required');
    }

    const canOrderForCustomer = await this.orderAccess.canAccessOrder(user, {
      customerId,
    });

    if (!canOrderForCustomer) {
      throw new ForbiddenException(
        'You cannot place orders for this customer',
      );
    }

    await this.assertDiscountAllowed(user, dto);

    return this.orderService.createOrder(organizationId, {
      ...dto,
      customerId,
    });
  }

  // কাউন্টারে staff-এর হাতে-রেকর্ড করা পেমেন্ট (নগদ ইত্যাদি)। Customer-দের
  // জন্য নয় — তারা POST /payments/orders/:id/online ব্যবহার করবে।
  @Post(':id/payments')
  @RequirePermission('payment.create')
  @UseGuards(OrderAccessGuard)
  async createPayment(
    @OrganizationId() organizationId: number,
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreatePaymentDto,
  ) {
    const user = request.authUser!;

    if (!(await this.orderAccess.isStaff(user))) {
      throw new ForbiddenException(
        'Customers must pay through online checkout',
      );
    }

    if (
      ONLINE_METHODS.includes(dto.method) &&
      !(await this.orderAccess.canOverrideOnlinePayments(user))
    ) {
      throw new ForbiddenException(
        'Online payments must go through the payment gateway',
      );
    }

    return this.orderService.createPayment(organizationId, id, dto);
  }

  private async assertDiscountAllowed(
    user: NonNullable<AuthenticatedRequest['authUser']>,
    dto: CreateOrderDto,
  ): Promise<void> {
    if (!dto.discountType && dto.discountValue === undefined) {
      return;
    }

    const policy = await this.orderAccess.getDiscountPolicy(user);

    if (!policy.allowed) {
      throw new ForbiddenException('You are not allowed to apply discounts');
    }

    if (policy.maxPercent !== null) {
      const isPercent = dto.discountType === 'PERCENTAGE';

      if (!isPercent || (dto.discountValue ?? 0) > policy.maxPercent) {
        throw new ForbiddenException(
          `Your role can apply only percentage discounts up to ${policy.maxPercent}%`,
        );
      }
    }
  }

  @Patch(':id/confirm')
  @RequirePermission('order.update')
  @UseGuards(OrderAccessGuard)
  confirmOrder(
    @OrganizationId() organizationId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.orderService.confirmOrder(organizationId, id);
  }
   @Patch(':id/process')
  @RequirePermission('order.update')
  @UseGuards(OrderAccessGuard)
  processOrder(
    @OrganizationId() organizationId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.orderService.processOrder(organizationId, id);
  }

  @Patch(':id/cancel')
  @RequirePermission('order.update')
  @UseGuards(OrderAccessGuard)
  cancelOrder(
    @OrganizationId() organizationId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.orderService.cancelOrder(organizationId, id);
  }

  @Patch(':id/ship')
  @RequirePermission('order.update')
  @UseGuards(OrderAccessGuard)
  shipOrder(
    @OrganizationId() organizationId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.orderService.shipOrder(organizationId, id);
  }

  @Patch(':id/deliver')
  @RequirePermission('order.update')
  @UseGuards(OrderAccessGuard)
  deliverOrder(
    @OrganizationId() organizationId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.orderService.deliverOrder(organizationId, id);
  }

   @Patch(':id/return')
  @RequirePermission('order.update')
  @UseGuards(OrderAccessGuard)
  returnOrder(
    @OrganizationId() organizationId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.orderService.returnOrder(organizationId, id);
  }

  @Get(':id')
  @RequirePermission('order.read')
  @UseGuards(OrderAccessGuard)
  getOrder(
    @OrganizationId() organizationId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.orderService.getOrder(organizationId, id);
  }

  @Get()
  @RequirePermission('order.read')
  async listOrders(
    @OrganizationId() organizationId: number,
    @Req() request: AuthenticatedRequest,
  ) {
    const customerIds =
      await this.orderAccess.getAccessibleCustomerIds(
        request.authUser!,
      );
    return this.orderService.listOrders(organizationId, customerIds);
  }
}