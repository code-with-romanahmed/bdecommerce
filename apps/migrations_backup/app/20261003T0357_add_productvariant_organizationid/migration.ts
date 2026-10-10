#!/usr/bin/env -S node
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';
import type { Contract as End } from '../../snapshots/10631d3d0c02408fe74464095005692b80d9d1cc0ec7e77e79942490a2f74ab3/contract';
import endContract from '../../snapshots/10631d3d0c02408fe74464095005692b80d9d1cc0ec7e77e79942490a2f74ab3/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/d91d2567317597e7d3d80ec08779042db7427611633f07d1cfb0ed8742cd3b6c/contract';
import startContract from '../../snapshots/d91d2567317597e7d3d80ec08779042db7427611633f07d1cfb0ed8742cd3b6c/contract.json' with { type: 'json' };

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
        table: 'productVariant',
        column: col('organizationId', 'int4', {
          default: lit(5),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
      this.setNotNull({ schema: 'public', table: 'productVariant', column: 'organizationId' }),
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
