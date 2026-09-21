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
import { RequirePermission } from '../rbac/permission.decorator.js';
import { PermissionGuard } from '../rbac/permission.guard.js';

import { CreateOrderDto } from './order.dto.js';
import { OrderService } from './order.service.js';

@Controller('orders')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @RequirePermission('order.update')
  createOrder(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateOrderDto,
  ) {
    return this.orderService.createOrder(
      request.authUser!.organizationId,
      dto,
    );
  }

    @Patch(':id/confirm')
  @RequirePermission('order.update')
  confirmOrder(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.orderService.confirmOrder(
      request.authUser!.organizationId,
      id,
    );
  }

  @Patch(':id/cancel')
  @RequirePermission('order.update')
  cancelOrder(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.orderService.cancelOrder(
      request.authUser!.organizationId,
      id,
    );
  }


  @Get(':id')
  @RequirePermission('order.read')
  getOrder(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.orderService.getOrder(
      request.authUser!.organizationId,
      id,
    );
  }

  @Get()
  @RequirePermission('order.read')
  listOrders(@Req() request: AuthenticatedRequest) {
    return this.orderService.listOrders(
      request.authUser!.organizationId,
    );
    
  }
  
}
