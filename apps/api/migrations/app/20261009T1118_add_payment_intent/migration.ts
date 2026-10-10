#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/92eff8560d30c39dc274e531b5abd1eb0eaf5cd84ba9c0f09014c6658cf2fd44/contract';
import startContract from '../../snapshots/92eff8560d30c39dc274e531b5abd1eb0eaf5cd84ba9c0f09014c6658cf2fd44/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/94d05582c865d19d761b2b8f0d3efdb9b9d8eb4195657f855551ec108e7b4f91/contract';
import endContract from '../../snapshots/94d05582c865d19d761b2b8f0d3efdb9b9d8eb4195657f855551ec108e7b4f91/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'paymentIntent',
        columns: [
          col('amount', 'numeric(12,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 12, scale: 2 } },
          }),
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
          col('customerId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('failureReason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('gatewayPaymentId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('invoiceNumber', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('orderId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('organizationId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('provider', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('publicId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('redirectUrl', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('INITIATED'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('transactionId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'paymentIntent_provider_check_5cf069c7',
            "\"provider\" IN ('COD', 'BKASH', 'NAGAD', 'ROCKET', 'CARD', 'OTHER')",
          ),
          checkExpression(
            'paymentIntent_status_check_fbb3901c',
            "\"status\" IN ('INITIATED', 'COMPLETED', 'FAILED', 'NEEDS_REVIEW')",
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'paymentIntent',
        constraint: 'paymentIntent_publicId_key',
        columns: ['publicId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'paymentIntent',
        constraint: 'paymentIntent_invoiceNumber_key',
        columns: ['invoiceNumber'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'paymentIntent',
        constraint: 'paymentIntent_provider_gatewayPaymentId_key',
        columns: ['provider', 'gatewayPaymentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'paymentIntent',
        index: 'paymentIntent_orderId_idx_d284871b',
        columns: ['orderId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'paymentIntent',
        index: 'paymentIntent_organizationId_status_idx_21af5e82',
        columns: ['organizationId', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'paymentIntent',
        index: 'paymentIntent_status_idx_e98638ab',
        columns: ['status'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
