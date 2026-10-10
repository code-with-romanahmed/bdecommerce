#!/usr/bin/env -S node
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';
import type { Contract as Start } from '../../snapshots/037bd329a4b6b9e23a6479b6b15ded0525f0493bde5362ffdf8f32c78fcc172d/contract';
import startContract from '../../snapshots/037bd329a4b6b9e23a6479b6b15ded0525f0493bde5362ffdf8f32c78fcc172d/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/92eff8560d30c39dc274e531b5abd1eb0eaf5cd84ba9c0f09014c6658cf2fd44/contract';
import endContract from '../../snapshots/92eff8560d30c39dc274e531b5abd1eb0eaf5cd84ba9c0f09014c6658cf2fd44/contract.json' with { type: 'json' };

// ⚠ এই সংস্করণে backfill (dataTransform) নেই। তাই payment টেবিলে কোনো row
// থাকলে setNotNull ব্যর্থ হবে এবং পুরো `db migrate` rollback হবে (ক্ষতি নেই)।
// শুধু তখনই ব্যবহার করুন যখন `SELECT COUNT(*) FROM public.payment` = 0।

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropIndex({
        schema: 'public',
        table: 'payment',
        index: 'payment_transactionId_idx_d3180832',
      }),
      this.addColumn({
        schema: 'public',
        table: 'payment',
        column: col('organizationId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.setNotNull({ schema: 'public', table: 'payment', column: 'organizationId' }),
      this.createIndex({
        schema: 'public',
        table: 'payment',
        index: 'payment_organizationId_transactionId_idx_a5842b20',
        columns: ['organizationId', 'transactionId'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);