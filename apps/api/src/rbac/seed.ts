import { db } from '../prisma/db.js';

const permissions = [
  {
    code: 'user.read',
    name: 'Read users',
    description: 'View users within the organization',
  },
  {
    code: 'user.create',
    name: 'Create users',
    description: 'Create users within the organization',
  },
  {
    code: 'user.update',
    name: 'Update users',
    description: 'Update users within the organization',
  },
  {
    code: 'product.read',
    name: 'Read products',
    description: 'View products',
  },
  {
    code: 'product.create',
    name: 'Create products',
    description: 'Create products',
  },
  {
    code: 'product.update',
    name: 'Update products',
    description: 'Update products',
  },
  {
    code: 'order.read',
    name: 'Read orders',
    description: 'View orders',
  },
  {
    code: 'order.update',
    name: 'Update orders',
    description: 'Update orders',
  },
  {
    code: 'inventory.read',
    name: 'Read inventory',
    description: 'View inventory',
  },
  {
    code: 'inventory.update',
    name: 'Update inventory',
    description: 'Update inventory',
  },
    {
    code: 'customer.read',
    name: 'Read customers',
    description: 'View customers and addresses',
  },
  {
    code: 'customer.update',
    name: 'Update customers',
    description: 'Create/update customers and addresses',
  },
  {
    code: 'cart.read',
    name: 'Read carts',
    description: 'View carts and cart items',
  },
  {
    code: 'cart.update',
    name: 'Update carts',
    description: 'Create/update carts and cart items',
  },
  {
  code: 'invoice.read',
  name: 'Read invoices',
  description: 'View invoices and download PDF',
},
{
  code: 'invoice.create',
  name: 'Create invoices',
  description: 'Manually (re)generate an invoice for an order',
},
] as const;

const rolePermissions: Record<string, string[]> = {
  SUPER_ADMIN: permissions.map(
    (permission) => permission.code,
  ),

  ADMIN: permissions.map(
    (permission) => permission.code,
  ),

  MANAGER: [
    'user.read',
    'product.read',
    'product.create',
    'product.update',
    'order.read',
    'order.update',
    'inventory.read',
    'inventory.update',
    'customer.read',
    'customer.update',
    'cart.read',
    'cart.update',
    'invoice.read',
    'invoice.create',
  ],

  CASHIER: [
    'product.read',
    'order.read',
    'order.update',
    'inventory.read',
    'customer.read',
    'customer.update',
    'cart.read',
    'cart.update',
    'invoice.read',
    'invoice.create',
  ],

  WAREHOUSE: [
    'product.read',
    'inventory.read',
    'inventory.update',
  ],

  DELIVERY_AGENT: [
    'order.read',
    'order.update',
  ],

    CUSTOMER: [
    'product.read',
    'order.read',
    'cart.read',
    'cart.update',
     'invoice.read',
  ],
};

export async function seedRbac(
  organizationId: number,
) {
  const permissionMap = new Map<
    string,
    number
  >();

  for (const permission of permissions) {
    const existing =
      await db.orm.public.Permission
        .where({ code: permission.code })
        .first();

    const record =
      existing ??
      (await db.orm.public.Permission.create(
        permission,
      ));

    permissionMap.set(
      permission.code,
      record.id,
    );
  }

  for (const [roleName, permissionCodes] of Object.entries(
    rolePermissions,
  )) {
    const existingRole =
      await db.orm.public.Role
        .where({
          organizationId,
          name: roleName,
        })
        .first();

    const role =
      existingRole ??
      (await db.orm.public.Role.create({
        organizationId,
        name: roleName,
      }));

    for (const permissionCode of permissionCodes) {
      const permissionId =
        permissionMap.get(permissionCode);

      if (!permissionId) {
        throw new Error(
          `Permission not found: ${permissionCode}`,
        );
      }

      const existingRolePermission =
        await db.orm.public.RolePermission
          .where({
            roleId: role.id,
            permissionId,
          })
          .first();

      if (!existingRolePermission) {
        await db.orm.public.RolePermission.create({
          roleId: role.id,
          permissionId,
        });
      }
    }
  }
}