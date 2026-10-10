#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/75dbee7215bac47d94c6c67e8ecdfed2151c0b00e456f928b1fe5d211aef312d/contract';
import startContract from '../../snapshots/75dbee7215bac47d94c6c67e8ecdfed2151c0b00e456f928b1fe5d211aef312d/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/d91d2567317597e7d3d80ec08779042db7427611633f07d1cfb0ed8742cd3b6c/contract';
import endContract from '../../snapshots/d91d2567317597e7d3d80ec08779042db7427611633f07d1cfb0ed8742cd3b6c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
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
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
