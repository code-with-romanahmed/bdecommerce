#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/414cc1d99229b2f1b85eeefb1db72b341f85f472597151cdcd4439da18c42e0b/contract';
import endContract from '../../snapshots/414cc1d99229b2f1b85eeefb1db72b341f85f472597151cdcd4439da18c42e0b/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/63513ac5f02842f3ec20fecc468ff2e2a73aee357f0d911cd6779e548914df64/contract';
import startContract from '../../snapshots/63513ac5f02842f3ec20fecc468ff2e2a73aee357f0d911cd6779e548914df64/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'invoice',
        columns: [
          col('billingAddress', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('currency', 'text', {
            notNull: true,
            default: lit('BDT'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('customerEmail', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('customerName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('customerPhone', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('discountTotal', 'numeric(12,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 12, scale: 2 } },
          }),
          col('grandTotal', 'numeric(12,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 12, scale: 2 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('invoiceNumber', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('orderId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('shippingAddress', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('shippingTotal', 'numeric(12,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 12, scale: 2 } },
          }),
          col('subtotal', 'numeric(12,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 12, scale: 2 } },
          }),
          col('taxTotal', 'numeric(12,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 12, scale: 2 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'invoice',
        constraint: 'invoice_orderId_key',
        columns: ['orderId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'invoice',
        constraint: 'invoice_invoiceNumber_key',
        columns: ['invoiceNumber'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'invoice',
        index: 'invoice_invoiceNumber_idx_05f933ec',
        columns: ['invoiceNumber'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'invoice',
        foreignKey: {
          name: 'invoice_orderId_fkey',
          columns: ['orderId'],
          references: { schema: 'public', table: 'order', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
