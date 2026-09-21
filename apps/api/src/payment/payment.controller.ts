import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../rbac/permission.decorator.js';
import { PermissionGuard } from '../rbac/permission.guard.js';

import { RecordPaymentDto } from './payment.dto.js';
import { PaymentService } from './payment.service.js';

@Controller('orders/:orderId/payments')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post()
  @RequirePermission('order.update')
  recordPayment(
    @Req() request: AuthenticatedRequest,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.paymentService.recordPayment(
      request.authUser!.organizationId,
      orderId,
      dto,
    );
  }

  @Get()
  @RequirePermission('order.read')
  listPayments(
    @Req() request: AuthenticatedRequest,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.paymentService.listPayments(
      request.authUser!.organizationId,
      orderId,
    );
  }
}
