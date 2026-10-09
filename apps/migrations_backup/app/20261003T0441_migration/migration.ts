#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/10631d3d0c02408fe74464095005692b80d9d1cc0ec7e77e79942490a2f74ab3/contract';
import endContract from '../../snapshots/10631d3d0c02408fe74464095005692b80d9d1cc0ec7e77e79942490a2f74ab3/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/75dbee7215bac47d94c6c67e8ecdfed2151c0b00e456f928b1fe5d211aef312d/contract';
import startContract from '../../snapshots/75dbee7215bac47d94c6c67e8ecdfed2151c0b00e456f928b1fe5d211aef312d/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, placeholder } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropConstraint({
        schema: 'public',
        table: 'productVariant',
        constraint: 'productVariant_sku_key',
      }),
      this.addColumn({
        schema: 'public',
        table: 'order',
        column: col('riskLevel', 'text', {
          notNull: true,
          default: lit('NONE'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'order',
        column: col('riskReason', 'text[]', {
          notNull: true,
          default: lit([]),
          codecRef: { codecId: 'pg/text@1', many: true },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'productVariant',
        column: col('organizationId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.dataTransform(endContract, 'backfill-productVariant-organizationId', {
        check: () => placeholder('backfill-productVariant-organizationId:check'),
        run: () => placeholder('backfill-productVariant-organizationId:run'),
      }),
      this.setNotNull({ schema: 'public', table: 'productVariant', column: 'organizationId' }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'order',
        constraint: 'order_riskLevel_check_f281c532',
        expression: "\"riskLevel\" IN ('NONE', 'MEDIUM', 'HIGH')",
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'order',
        constraint: 'order_riskReason_elem_not_null_c275fa3b',
        expression: 'array_position("riskReason", NULL) IS NULL',
      }),
      this.addUnique({
        schema: 'public',
        table: 'productVariant',
        constraint: 'productVariant_organizationId_sku_key',
        columns: ['organizationId', 'sku'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'productVariant',
        index: 'productVariant_organizationId_idx_2e17ef41',
        columns: ['organizationId'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
