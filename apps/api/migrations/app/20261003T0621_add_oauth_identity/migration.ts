#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/037bd329a4b6b9e23a6479b6b15ded0525f0493bde5362ffdf8f32c78fcc172d/contract';
import endContract from '../../snapshots/037bd329a4b6b9e23a6479b6b15ded0525f0493bde5362ffdf8f32c78fcc172d/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/10631d3d0c02408fe74464095005692b80d9d1cc0ec7e77e79942490a2f74ab3/contract';
import startContract from '../../snapshots/10631d3d0c02408fe74464095005692b80d9d1cc0ec7e77e79942490a2f74ab3/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'oAuthIdentity',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('email', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('provider', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('providerUserId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.dropNotNull({ schema: 'public', table: 'user', column: 'phone' }),
      this.addUnique({
        schema: 'public',
        table: 'oAuthIdentity',
        constraint: 'oAuthIdentity_provider_providerUserId_key',
        columns: ['provider', 'providerUserId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'oAuthIdentity',
        index: 'oAuthIdentity_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'oAuthIdentity',
        foreignKey: {
          name: 'oAuthIdentity_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
