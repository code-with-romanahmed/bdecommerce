// invoice/invoice-pdf.service.ts
//
// নতুন dependency লাগবে (আগে থেকে project-এ কোনো PDF library নেই):
//   npm install pdfkit
//   npm install --save-dev @types/pdfkit
//
// pdfkit বেছে নেওয়ার কারণ: pure JS, কোনো headless browser
// (puppeteer-এর মতো) লাগে না — deploy করা হালকা থাকে।

import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

@Injectable()
export class InvoicePdfService {
  async renderInvoicePdf(
    invoice: {
      invoiceNumber: string;
      currency: string;
      subtotal: unknown;
      discountTotal: unknown;
      shippingTotal: unknown;
      taxTotal: unknown;
      grandTotal: unknown;
      customerName: string;
      customerPhone: string;
      customerEmail: string | null;
      shippingAddress: string;
      createdAt: string;
    },
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc
        .fontSize(20)
        .text('Invoice', { align: 'right' })
        .fontSize(10)
        .text(invoice.invoiceNumber, { align: 'right' })
        .text(
          new Date(invoice.createdAt).toLocaleDateString('en-GB'),
          { align: 'right' },
        )
        .moveDown(2);

      doc
        .fontSize(12)
        .text('Bill To:')
        .fontSize(10)
        .text(invoice.customerName)
        .text(invoice.customerPhone)
        .text(invoice.customerEmail ?? '')
        .text(invoice.shippingAddress)
        .moveDown(2);

      const rows: [string, string][] = [
        ['Subtotal', formatMoney(invoice.subtotal, invoice.currency)],
        ['Discount', formatMoney(-Number(invoice.discountTotal), invoice.currency)],
        ['Shipping', formatMoney(invoice.shippingTotal, invoice.currency)],
        ['Tax', formatMoney(invoice.taxTotal, invoice.currency)],
      ];

      for (const [label, value] of rows) {
        doc
          .fontSize(10)
          .text(label, { continued: true })
          .text(value, { align: 'right' });
      }

      doc
        .moveDown(0.5)
        .fontSize(12)
        .text('Grand Total', { continued: true })
        .text(
          formatMoney(invoice.grandTotal, invoice.currency),
          { align: 'right' },
        );

      doc.end();
    });
  }
}

function formatMoney(amount: unknown, currency: string): string {
  return `${currency} ${Number(amount).toFixed(2)}`;
}
