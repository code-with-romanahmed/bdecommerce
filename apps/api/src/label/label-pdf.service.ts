// label/label-pdf.service.ts
//
// নতুন dependency:
//   npm install qrcode
//   npm install --save-dev @types/qrcode

import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';

const LABEL_WIDTH = 2 * 72;   // 144pt
const LABEL_HEIGHT = 3 * 72;  // 216pt

export interface LabelOrderItem {
  sku: string;
  productName: string;
  quantity: number;
}

export interface LabelData {
  orderNumber: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  shippingAddressLine1: string;
  shippingAddressLine2: string | null;
  shippingCity: string;
  shippingDistrict: string;
  items: LabelOrderItem[];
}

@Injectable()
export class LabelPdfService {
  async renderOrderLabel(data: LabelData): Promise<Buffer> {
    const qrPayload = JSON.stringify({
      orderNumber: data.orderNumber,
      items: data.items.map((i) => ({ sku: i.sku, qty: i.quantity })),
    });

    const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 0 });

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: [LABEL_WIDTH, LABEL_HEIGHT],
        margin: 8,
      });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(data.orderNumber, { align: 'center' })
        .fontSize(6)
        .font('Helvetica')
        .text(
          new Date(data.createdAt).toLocaleDateString('en-GB'),
          { align: 'center' },
        )
        .moveDown(0.5);

      doc
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(LABEL_WIDTH - doc.page.margins.right, doc.y)
        .stroke();
      doc.moveDown(0.3);

      // Shipping info
      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .text('TO:')
        .fontSize(7)
        .font('Helvetica')
        .text(data.customerName)
        .text(data.customerPhone)
        .text(data.shippingAddressLine1)
        .text(data.shippingAddressLine2 ?? '')
        .text(`${data.shippingCity}, ${data.shippingDistrict}`)
        .moveDown(0.4);

      doc
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(LABEL_WIDTH - doc.page.margins.right, doc.y)
        .stroke();
      doc.moveDown(0.3);

      // Product/packing info
      doc.fontSize(8).font('Helvetica-Bold').text('ITEMS:');
      doc.fontSize(6).font('Helvetica');

      for (const item of data.items) {
        doc.text(`${item.sku} x${item.quantity}`);
        doc.text(item.productName, { width: LABEL_WIDTH - 16 });
      }

      // QR code — bottom, centered
      const qrSize = 60;
      const qrX = (LABEL_WIDTH - qrSize) / 2;
      const qrY = LABEL_HEIGHT - qrSize - 10;

      doc.image(qrDataUrl, qrX, qrY, {
        width: qrSize,
        height: qrSize,
      });

      doc.end();
    });
  }
}