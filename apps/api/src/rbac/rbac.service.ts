import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { db } from '../prisma/db.js';

@Injectable()
export class RbacService {
  async hasRole(
    userId: number,
    organizationId: number,
    roleName: string,
  ): Promise<boolean> {
    const userRoles =
      await db.orm.public.UserRole
        .where({ userId })
        .all();

    for (const userRole of userRoles) {
      const role =
        await db.orm.public.Role
          .where({
            id: userRole.roleId,
            organizationId,
          })
          .first();

      if (
        role &&
        role.name === roleName &&
        role.status === 'ACTIVE'
      ) {
        return true;
      }
    }

    return false;
  }

  async hasPermission(
    userId: number,
    organizationId: number,
    permissionCode: string,
  ): Promise<boolean> {
    const userRoles =
      await db.orm.public.UserRole
        .where({ userId })
        .all();

    for (const userRole of userRoles) {
      const role =
        await db.orm.public.Role
          .where({
            id: userRole.roleId,
            organizationId,
          })
          .first();

      if (!role || role.status !== 'ACTIVE') {
        continue;
      }

      const rolePermissions =
        await db.orm.public.RolePermission
          .where({ roleId: role.id })
          .all();

      for (const rolePermission of rolePermissions) {
        const permission =
          await db.orm.public.Permission
            .where({
              id: rolePermission.permissionId,
            })
            .first();

        if (
          permission &&
          permission.code === permissionCode
        ) {
          return true;
        }
      }
    }

    return false;
  }

  async requirePermission(
    userId: number,
    organizationId: number,
    permissionCode: string,
  ): Promise<void> {
    const allowed =
      await this.hasPermission(
        userId,
        organizationId,
        permissionCode,
      );

    if (!allowed) {
      throw new ForbiddenException(
        'Insufficient permissions',
      );
    }
  }
}
