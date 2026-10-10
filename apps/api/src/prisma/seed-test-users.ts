// RBAC পরীক্ষার জন্য দুটো টেস্ট ইউজার বানায় (বারবার চালালেও নিরাপদ):
//   1) +8801700000001  → MANAGER role         (payment.override নেই → 403 আসা উচিত)
//   2) +8801700000002  → TEST_INACTIVE_ADMIN  (ADMIN-এর সব permission, কিন্তু role INACTIVE → 403 আসা উচিত)
//
// চালানোর নিয়ম: seed-rbac-all.ts যেভাবে চালান ঠিক সেভাবেই, শেষে organization id দিয়ে:
//   <আপনার runner> src/prisma/seed-test-users.ts <organizationId>
//
// আগে seed-rbac-all.ts চালানো থাকতে হবে (MANAGER ও ADMIN role থাকতে হবে)।
import { db } from './db.js';

const organizationId = Number(process.argv[2]);

if (!Number.isInteger(organizationId) || organizationId <= 0) {
  console.error('ব্যবহার: seed-test-users.ts <organizationId>');
  process.exit(1);
}

// ঐচ্ছিক: নম্বর নিজে দিতে পারেন (বাংলাদেশি মোবাইল, +8801XXXXXXXXX)
//   ... seed-test-users.ts 5 +8801711111111 +8801722222222
const MANAGER_PHONE = process.argv[3] ?? '+8801700000001';
const INACTIVE_ADMIN_PHONE = process.argv[4] ?? '+8801700000002';
const INACTIVE_ROLE_NAME = 'TEST_INACTIVE_ADMIN';

const PHONE_PATTERN = /^\+8801[3-9]\d{8}$/;

for (const phone of [MANAGER_PHONE, INACTIVE_ADMIN_PHONE]) {
  if (!PHONE_PATTERN.test(phone)) {
    console.error(`অবৈধ নম্বর: ${phone} (ফরম্যাট: +8801XXXXXXXXX)`);
    process.exit(1);
  }
}

async function findRole(name: string) {
  const role = await db.orm.public.Role
    .where({ organizationId, name })
    .first();

  if (!role) {
    throw new Error(
      `Organization ${organizationId}-এ "${name}" role নেই। আগে seed-rbac-all.ts চালান।`,
    );
  }

  return role;
}

async function ensureUser(phone: string, name: string) {
  const existing = await db.orm.public.User.where({ phone }).first();

  if (existing) {
    if (existing.organizationId !== organizationId) {
      throw new Error(
        `${phone} নম্বরটা organization ${existing.organizationId}-এর ইউজার (id ${existing.id}, নাম: ${existing.name ?? '-'})-এর। ` +
          `টেস্টের জন্য অন্য নম্বর দিন, অথবা সঠিক organization id ব্যবহার করুন।`,
      );
    }

    return existing;
  }

  return db.orm.public.User.create({ organizationId, phone, name });
}

async function ensureUserRole(userId: number, roleId: number) {
  const existing = await db.orm.public.UserRole
    .where({ userId, roleId })
    .first();

  if (!existing) {
    await db.orm.public.UserRole.create({ userId, roleId });
  }
}

// ---- MANAGER ইউজার ----
const managerRole = await findRole('MANAGER');
const managerUser = await ensureUser(MANAGER_PHONE, 'Test Manager');
await ensureUserRole(managerUser.id, managerRole.id);

// ---- INACTIVE ADMIN ইউজার ----
const adminRole = await findRole('ADMIN');
const adminPermissions = await db.orm.public.RolePermission
  .where({ roleId: adminRole.id })
  .all();

const existingInactiveRole = await db.orm.public.Role
  .where({ organizationId, name: INACTIVE_ROLE_NAME })
  .first();

const inactiveRole =
  existingInactiveRole ??
  (await db.orm.public.Role.create({
    organizationId,
    name: INACTIVE_ROLE_NAME,
    status: 'INACTIVE',
  }));

if (inactiveRole.status !== 'INACTIVE') {
  throw new Error(
    `"${INACTIVE_ROLE_NAME}" role আগে থেকেই আছে কিন্তু INACTIVE নয়। পরীক্ষা ভুল হবে, role-টা মুছে আবার চালান।`,
  );
}

for (const { permissionId } of adminPermissions) {
  const existing = await db.orm.public.RolePermission
    .where({ roleId: inactiveRole.id, permissionId })
    .first();

  if (!existing) {
    await db.orm.public.RolePermission.create({
      roleId: inactiveRole.id,
      permissionId,
    });
  }
}

const inactiveAdminUser = await ensureUser(INACTIVE_ADMIN_PHONE, 'Test Inactive Admin');
await ensureUserRole(inactiveAdminUser.id, inactiveRole.id);

console.log(`Organization ${organizationId}:`);
console.log(`  MANAGER ইউজার        : ${MANAGER_PHONE} (userId ${managerUser.id})`);
console.log(`  INACTIVE ADMIN ইউজার : ${INACTIVE_ADMIN_PHONE} (userId ${inactiveAdminUser.id})`);
process.exit(0);