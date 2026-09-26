import {
  Body,
  Controller,
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

@Controller('orders')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly orderAccess: OrderAccessService,
  ) {}

  @Post()
  @RequirePermission('order.create')
  createOrder(
    @OrganizationId() organizationId: number,
    @Body() dto: CreateOrderDto,
  ) {
    return this.orderService.createOrder(organizationId, dto);
  }

  @Post(':id/payments')
  @RequirePermission('order.update')
  @UseGuards(OrderAccessGuard)
  createPayment(
    @OrganizationId() organizationId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.orderService.createPayment(organizationId, id, dto);
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