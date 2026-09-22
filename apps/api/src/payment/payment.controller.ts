import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationId } from '../auth/organization-context.decorator.js';
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
    @OrganizationId() organizationId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.paymentService.recordPayment(organizationId, orderId, dto);
  }

  @Get()
  @RequirePermission('order.read')
  listPayments(
    @OrganizationId() organizationId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.paymentService.listPayments(organizationId, orderId);
  }
}