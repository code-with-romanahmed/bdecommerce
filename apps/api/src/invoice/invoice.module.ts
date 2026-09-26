// invoice/invoice.module.ts
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';

import { InvoiceAccessGuard } from './invoice-access.guard.js';
import { InvoiceAccessService } from './invoice-access.service.js';
import { InvoiceController } from './invoice.controller.js';
import { InvoicePdfService } from './invoice-pdf.service.js';
import { InvoiceService } from './invoice.service.js';

@Module({
  imports: [AuthModule],
  controllers: [InvoiceController],
  providers: [
    InvoiceService,
    InvoiceAccessService,
    InvoiceAccessGuard,
    InvoicePdfService,
  ],
  exports: [InvoiceService],
})
export class InvoiceModule {}
