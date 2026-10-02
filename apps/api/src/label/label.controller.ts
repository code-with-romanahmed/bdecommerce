import {
    Controller,
    Get,
    NotFoundException,
    Param,
    ParseIntPipe,
    Res,
    UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationId } from '../auth/organization-context.decorator.js';
import { db } from '../prisma/db.js';
import { RequirePermission } from '../rbac/permission.decorator.js';
import { PermissionGuard } from '../rbac/permission.guard.js';

import { OrderAccessGuard } from '../order/order-access.guard.js';
import { LabelPdfService } from './label-pdf.service.js';

@Controller('orders/:id/label')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class LabelController {
  constructor(private readonly labelPdfService: LabelPdfService) {}

  @Get('pdf')
  @RequirePermission('order.read')
  @UseGuards(OrderAccessGuard)
  async getLabelPdf(
    @OrganizationId() organizationId: number,
    @Param('id', ParseIntPipe) orderId: number,
    @Res() res: Response,
  ) {
    const order = await db.orm.public.Order
      .where({ id: orderId, organizationId })
      .first();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const items = await db.orm.public.OrderItem
      .where({ orderId: order.id })
      .all();

    const pdfBuffer = await this.labelPdfService.renderOrderLabel({
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      shippingAddressLine1: order.shippingAddressLine1,
      shippingAddressLine2: order.shippingAddressLine2 ?? null,
      shippingCity: order.shippingCity,
      shippingDistrict: order.shippingDistrict,
      items: items.map((i) => ({
        sku: i.sku,
        productName: i.productName,
        quantity: i.quantity,
      })),
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="label-${order.orderNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }
}