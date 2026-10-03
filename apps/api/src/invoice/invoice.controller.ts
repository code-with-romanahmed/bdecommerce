// invoice/invoice.controller.ts
import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationId } from '../auth/organization-context.decorator.js';
import { RequirePermission } from '../rbac/permission.decorator.js';
import { PermissionGuard } from '../rbac/permission.guard.js';

import { InvoiceAccessGuard } from './invoice-access.guard.js';
import { InvoicePdfService } from './invoice-pdf.service.js';
import { InvoiceService } from './invoice.service.js';

@Controller('invoices')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class InvoiceController {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly invoicePdfService: InvoicePdfService,
  ) {}

  @Get(':invoiceId')
  @RequirePermission('invoice.read')
  @UseGuards(InvoiceAccessGuard)
  async getInvoice(
    @OrganizationId() organizationId: number,
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
  ) {
    const { invoice } = await this.invoiceService.getInvoice(
      organizationId,
      invoiceId,
    );
    return invoice;
  }

  @Get(':invoiceId/pdf')
  @RequirePermission('invoice.read')
  @UseGuards(InvoiceAccessGuard)
  async downloadPdf(
    @OrganizationId() organizationId: number,
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
    @Res() res: Response,
  ) {
    const { invoice } = await this.invoiceService.getInvoice(
      organizationId,
      invoiceId,
    );

    const pdfBuffer = await this.invoicePdfService.renderInvoicePdf(invoice);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }

  // Staff-only manual fallback — automatic generation order status
  // change-এ হওয়ার কথা (order.service.ts-এ wire করা বাকি), কিন্তু
  // কোনো কারণে miss হলে staff নিজে চাপ দিয়ে বানাতে পারবে।
  // 'invoice.create' একটা আলাদা staff-only permission — CUSTOMER-এর
  // এটা নেই, তাই এই route-এ InvoiceAccessGuard লাগে না, permission
  // gate-ই যথেষ্ট (CUSTOMER role-এর কাছে এই permission-ই নেই)।
  // Idempotent — আগে থেকে থাকলে duplicate তৈরি হবে না।
  @Post('generate/:orderId')
  @RequirePermission('invoice.create')
  async generate(
    @OrganizationId() organizationId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.invoiceService.generateForOrder(
      organizationId,
      orderId,
    );
  }
}
