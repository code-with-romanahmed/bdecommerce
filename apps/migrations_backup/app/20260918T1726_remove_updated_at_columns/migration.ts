#!/usr/bin/env -S node

import type { Contract as Start } from '../../snapshots/3bc9fc95464f211149847f8b9181987f9199738ec1d827dd326c45f1d3d3134f/contract';
import startContract from '../../snapshots/3bc9fc95464f211149847f8b9181987f9199738ec1d827dd326c45f1d3d3134f/contract.json' with { type: 'json' };

import type { Contract as End } from '../../snapshots/aa93a8fc16ca62fa8cb8674268ececb25f1bfad1b2c3dbe3354769059f369e15/contract';
import endContract from '../../snapshots/aa93a8fc16ca62fa8cb8674268ececb25f1bfad1b2c3dbe3354769059f369e15/contract.json' with { type: 'json' };

import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations(): Migration<Start, End>['operations'] {
    return [
      this.dropColumn({
        schema: 'public',
        table: 'branch',
        column: 'updatedAt',
      }),

      this.dropColumn({
        schema: 'public',
        table: 'category',
        column: 'updatedAt',
      }),

      this.dropColumn({
        schema: 'public',
        table: 'organization',
        column: 'updatedAt',
      }),

      this.dropColumn({
        schema: 'public',
        table: 'product',
        column: 'updatedAt',
      }),

      this.dropColumn({
        schema: 'public',
        table: 'productVariant',
        column: 'updatedAt',
      }),

      this.dropColumn({
        schema: 'public',
        table: 'user',
        column: 'updatedAt',
      }),

      this.dropColumn({
        schema: 'public',
        table: 'role',
        column: 'updatedAt',
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
