import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { db } from '../prisma/db.js';

interface Access {
  // এই organization-এ ইউজারের ACTIVE role-গুলোর নাম
  roles: Set<string>;
  // ওই role-গুলো থেকে পাওয়া permission code
  permissions: Set<string>;
  expiresAt: number;
  // যে "প্রজন্মে" লোড হয়েছিল (invalidate-এর সাথে মিলিয়ে পুরনো তথ্য ঠেকাতে)
  generation: number;
}

const DEFAULT_TTL_SECONDS = 30;
const MAX_CACHED_USERS = 5000;

/**
 * RBAC যাচাই — ফল আগের মতোই, কিন্তু ডাটাবেস-কল ধ্রুবক।
 *
 * আগে: লুপের ভেতরে লুপ; প্রতিটা Role ও প্রতিটা RolePermission-এর জন্য আলাদা query।
 * এখন: ইউজারের ACTIVE role + তাদের permission একটাই ORM কোয়েরিতে
 *      (relation filter `.some()` + নেস্টেড `.include()`) আসে, তারপর মেমরিতে cache হয়।
 *
 * ⚠ মেয়াদ: ডাটাবেসে role/permission বদলালে এই সার্ভারে সর্বোচ্চ TTL (ডিফল্ট ৩০
 *   সেকেন্ড) পরে কার্যকর হয়। অ্যাপ-কোড থেকে role বদলালে invalidateUser()/
 *   invalidateAll() ডাকুন। seed স্ক্রিপ্ট আলাদা প্রসেসে চলে, তাই seed-এর পর
 *   সার্ভার রিস্টার্ট করুন বা TTL পর্যন্ত অপেক্ষা করুন। একাধিক সার্ভার চললে
 *   প্রতিটা নিজের cache রাখে।
 *
 * ENV: RBAC_CACHE_TTL_SECONDS (ডিফল্ট 30; 0 দিলে cache বন্ধ, কিন্তু একক কোয়েরি থাকে)
 */
@Injectable()
export class RbacService {
  private readonly ttlMs: number;
  private readonly cache = new Map<string, Access>();
  private readonly loading = new Map<string, Promise<Access>>();
  private generation = 0;

  constructor() {
    const raw = process.env.RBAC_CACHE_TTL_SECONDS;
    const seconds =
      raw === undefined || raw === '' ? DEFAULT_TTL_SECONDS : Number(raw);

    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new Error(
        'RBAC_CACHE_TTL_SECONDS must be a number >= 0 (seconds; 0 disables the cache)',
      );
    }

    this.ttlMs = seconds * 1000;
  }

  async hasRole(
    userId: number,
    organizationId: number,
    roleName: string,
  ): Promise<boolean> {
    const access = await this.getAccess(userId, organizationId);

    return access.roles.has(roleName);
  }

  async hasPermission(
    userId: number,
    organizationId: number,
    permissionCode: string,
  ): Promise<boolean> {
    const access = await this.getAccess(userId, organizationId);

    return access.permissions.has(permissionCode);
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

  /**
   * একজন ইউজারের cache মোছে (organizationId দিলে শুধু ওই organization-এর)।
   * চলমান লোডও বাতিল করা হয়, যাতে invalidate-এর পরের কল পুরনো ফল না পায়।
   */
  invalidateUser(userId: number, organizationId?: number): void {
    this.generation++;

    if (organizationId !== undefined) {
      const key = `${organizationId}:${userId}`;

      this.cache.delete(key);
      this.loading.delete(key);
      return;
    }

    const suffix = `:${userId}`;

    for (const key of [...this.cache.keys()]) {
      if (key.endsWith(suffix)) {
        this.cache.delete(key);
      }
    }

    for (const key of [...this.loading.keys()]) {
      if (key.endsWith(suffix)) {
        this.loading.delete(key);
      }
    }
  }

  /** সব cache মোছে (role/permission সাধারণভাবে বদলালে)। */
  invalidateAll(): void {
    this.generation++;
    this.cache.clear();
    this.loading.clear();
  }

  // ------------------------------------------------------------------ ভেতরের কাজ

  private async getAccess(
    userId: number,
    organizationId: number,
  ): Promise<Access> {
    const key = `${organizationId}:${userId}`;

    if (this.ttlMs > 0) {
      const hit = this.cache.get(key);

      if (hit && hit.expiresAt > Date.now()) {
        return hit;
      }
    }

    // একই ইউজারের জন্য একসাথে অনেক কল এলে লোড একবারই হয়
    const pending = this.loading.get(key);

    if (pending) {
      return pending;
    }

    const load: Promise<Access> = this.loadAccess(userId, organizationId)
      .then((access) => {
        // role নেই এমন ইউজার cache হয় না (সদ্য role পেলে সঙ্গে সঙ্গে দেখা যাবে),
        // আর লোড চলাকালীন invalidate হয়ে গেলে পুরনো ফল রাখা হয় না
        if (
          this.ttlMs > 0 &&
          access.roles.size > 0 &&
          access.generation === this.generation
        ) {
          this.store(key, access);
        }

        return access;
      })
      .finally(() => {
        // শুধু নিজের এন্ট্রি মোছা: invalidate-এর পর বসানো নতুন লোড যেন না মুছে যায়
        if (this.loading.get(key) === load) {
          this.loading.delete(key);
        }
      });

    this.loading.set(key, load);

    return load;
  }

  private async loadAccess(
    userId: number,
    organizationId: number,
  ): Promise<Access> {
    const generation = this.generation;

    // একটাই কোয়েরি: এই organization-এর ACTIVE role, যেগুলো ইউজারকে দেওয়া,
    // সাথে প্রতিটা role-এর permission (RolePermission → Permission)
    const roles = await db.orm.public.Role
      .where({ organizationId, status: 'ACTIVE' })
      .where((role) =>
        role.userRoles.some((userRole) => userRole.userId.eq(userId)),
      )
      .include('permissions', (rolePermission) =>
        rolePermission.include('permission'),
      )
      .all();

    const roleNames = new Set<string>();
    const permissions = new Set<string>();

    for (const role of roles) {
      roleNames.add(role.name);

      for (const rolePermission of role.permissions) {
        permissions.add(rolePermission.permission.code);
      }
    }

    return {
      roles: roleNames,
      permissions,
      expiresAt: Date.now() + this.ttlMs,
      generation,
    };
  }

  private store(key: string, access: Access): void {
    // ভরা থাকলে সবচেয়ে পুরনো (আগে ঢোকা) বাদ; মেয়াদোত্তীর্ণ এন্ট্রি
    // পরের কলে নিজে থেকেই নতুন করে লোড হয়ে প্রতিস্থাপিত হয়
    if (this.cache.size >= MAX_CACHED_USERS && !this.cache.has(key)) {
      const oldest = this.cache.keys().next().value;

      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }

    this.cache.delete(key);
    this.cache.set(key, access);
  }
}