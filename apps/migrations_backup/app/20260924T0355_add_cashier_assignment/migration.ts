#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/414cc1d99229b2f1b85eeefb1db72b341f85f472597151cdcd4439da18c42e0b/contract';
import startContract from '../../snapshots/414cc1d99229b2f1b85eeefb1db72b341f85f472597151cdcd4439da18c42e0b/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/75dbee7215bac47d94c6c67e8ecdfed2151c0b00e456f928b1fe5d211aef312d/contract';
import endContract from '../../snapshots/75dbee7215bac47d94c6c67e8ecdfed2151c0b00e456f928b1fe5d211aef312d/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'cashierAssignment',
        columns: [
          col('cashierId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('customerId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('endedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('isActive', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('organizationId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('startedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'customer',
        column: col('userId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'customer',
        constraint: 'customer_userId_key',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'cashierAssignment',
        index: 'cashierAssignment_cashierId_idx_f55c4cfd',
        columns: ['cashierId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'cashierAssignment',
        index: 'cashierAssignment_cashierId_isActive_idx_4e2765fa',
        columns: ['cashierId', 'isActive'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'cashierAssignment',
        index: 'cashierAssignment_customerId_idx_b2a8a46c',
        columns: ['customerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'cashierAssignment',
        index: 'cashierAssignment_customerId_isActive_idx_ff4775e0',
        columns: ['customerId', 'isActive'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'cashierAssignment',
        index: 'cashierAssignment_organizationId_idx_2e17ef41',
        columns: ['organizationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'customer',
        index: 'customer_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'cashierAssignment',
        foreignKey: {
          name: 'cashierAssignment_organizationId_fkey',
          columns: ['organizationId'],
          references: { schema: 'public', table: 'organization', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'cashierAssignment',
        foreignKey: {
          name: 'cashierAssignment_cashierId_fkey',
          columns: ['cashierId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'cashierAssignment',
        foreignKey: {
          name: 'cashierAssignment_customerId_fkey',
          columns: ['customerId'],
          references: { schema: 'public', table: 'customer', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'customer',
        foreignKey: {
          name: 'customer_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
