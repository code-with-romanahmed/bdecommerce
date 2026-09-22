import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationId } from '../auth/organization-context.decorator.js';
import { RequirePermission } from '../rbac/permission.decorator.js';
import { PermissionGuard } from '../rbac/permission.guard.js';
import {
  CreateOrderDto,
  CreatePaymentDto,
} from './order.dto.js';
import { OrderService } from './order.service.js';

@Controller('orders')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @RequirePermission('order.update')
  createOrder(
    @OrganizationId() organizationId: number,
    @Body() dto: CreateOrderDto,
  ) {
    return this.orderService.createOrder(organizationId, dto);
  }
   @Post(':id/payments')
  @RequirePermission('order.update')
  createPayment(
    @OrganizationId() organizationId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.orderService.createPayment(organizationId, id, dto);
  }
  @Patch(':id/confirm')
  @RequirePermission('order.update')
  confirmOrder(
    @OrganizationId() organizationId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.orderService.confirmOrder(organizationId, id);
  }

  @Patch(':id/cancel')
  @RequirePermission('order.update')
  cancelOrder(
    @OrganizationId() organizationId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.orderService.cancelOrder(organizationId, id);
  }

  @Patch(':id/ship')
  @RequirePermission('order.update')
  shipOrder(
    @OrganizationId() organizationId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.orderService.shipOrder(organizationId, id);
  }

  @Patch(':id/deliver')
  @RequirePermission('order.update')
  deliverOrder(
    @OrganizationId() organizationId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.orderService.deliverOrder(organizationId, id);
  }

  @Get(':id')
  @RequirePermission('order.read')
  getOrder(
    @OrganizationId() organizationId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.orderService.getOrder(organizationId, id);
  }

  @Get()
  @RequirePermission('order.read')
  listOrders(@OrganizationId() organizationId: number) {
    return this.orderService.listOrders(organizationId);
  }
}