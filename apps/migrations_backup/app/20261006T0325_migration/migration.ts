#!/usr/bin/env -S node
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';
import postgres from '@prisma/orm-postgres/runtime';
import 'dotenv/config';
import type { Contract as Start } from '../../snapshots/037bd329a4b6b9e23a6479b6b15ded0525f0493bde5362ffdf8f32c78fcc172d/contract';
import startContract from '../../snapshots/037bd329a4b6b9e23a6479b6b15ded0525f0493bde5362ffdf8f32c78fcc172d/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/92eff8560d30c39dc274e531b5abd1eb0eaf5cd84ba9c0f09014c6658cf2fd44/contract';
import endContract from '../../snapshots/92eff8560d30c39dc274e531b5abd1eb0eaf5cd84ba9c0f09014c6658cf2fd44/contract.json' with { type: 'json' };

// তোমার src/prisma/db.ts যেভাবে client বানায়, ঠিক সেই একই পদ্ধতি —
// এটাই schema (public namespace) ঠিকমতো materialise করে। আগের
// attempt-এ আলাদাভাবে low-level sql()/createExecutionContext দিয়ে
// বানানোর কারণে "namespace not materialised" error এসেছিল।
// endContract (snapshot-এর contract.json) branded NamespaceId টাইপ
// অনুযায়ী structurally মেলে না (plain JSON string vs branded string) —
// কিন্তু runtime-এ এটা ঠিক valid contract object-ই। তাই এখানে টাইপ-চেক
// বাইপাস করা হলো (`as any`) — এটা শুধু এই one-off migration script,
// app-এর আসল db.ts-এ এই সমস্যা নেই কারণ সেখানে হাতে-লেখা contract.d.ts
// থেকে ঠিকমতো branded টাইপ আসে।
const db = postgres<End>({
  contractJson: endContract as any,
  url: process.env['DATABASE_URL']!,
});

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
      this.dataTransform(endContract, 'backfill-payment-organizationId', {
        // check: এখনো কোনো payment row-এ organizationId null আছে কিনা।
        // db.sql = lazy query builder (db.orm-এর মতো সাথে সাথে execute
        // হয় না) — dataTransform ঠিক এই builder-এর chain-টাই আশা করে।
        check: () =>
          db.sql.public.payment
            .select('id')
            .where((f, fns) => fns.eq(f.organizationId, null))
            .limit(1),

        // run: Payment.organizationId = owning Order.organizationId —
        // join লাগে, যা db.sql builder সরাসরি সাপোর্ট করে না, তাই
        // db.raw.sql (raw SQL escape hatch, একই db client-এর উপর)।
        run: () =>
          db.raw.sql`
            UPDATE "public"."payment" p
            SET "organizationId" = o."organizationId"
            FROM "public"."order" o
            WHERE p."orderId" = o."id"
              AND p."organizationId" IS NULL
          `.affectedCount(),
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