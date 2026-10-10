import { ForbiddenException } from '@nestjs/common';

import { RbacService } from './rbac.service.js';

// ---------------------------------------------------------------------------
// db মক: আসল ডাটাবেস লাগে না। Role কালেকশন ইন-মেমরি ডাটা থেকে উত্তর দেয় এবং
// RbacService-এর ব্যবহৃত চেইন সাপোর্ট করে:
//   .where({ ... }) / .where((role) => role.userRoles.some(...))
//   .include('permissions', ...)  .all()
// ---------------------------------------------------------------------------

interface FakeRole {
  id: number;
  organizationId: number;
  name: string;
  status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
  // এই role যাদের দেওয়া (UserRole.userId)
  userIds: number[];
  // এই role-এর permission code
  permissions: string[];
}

interface FakeRow {
  id: number;
  organizationId: number;
  name: string;
  status: FakeRole['status'];
  permissions: { permission: { code: string } }[];
}

type Predicate = (role: FakeRole) => boolean;

interface RoleProxy {
  userRoles: {
    some: (
      callback: (userRole: { userId: { eq: (value: number) => boolean } }) => boolean,
    ) => boolean;
  };
}

type WhereArg = Record<string, unknown> | ((role: RoleProxy) => boolean);

interface FakeQuery {
  where: (arg: WhereArg) => FakeQuery;
  include: (...args: unknown[]) => FakeQuery;
  all: () => Promise<FakeRow[]>;
}

const state = vi.hoisted(() => ({
  roles: [] as FakeRole[],
  queries: 0,
  // প্রতিটা all() কল এখান থেকে একটা করে "আটকে রাখা" প্রমিস নেয় (থাকলে)
  holds: [] as Promise<void>[],
}));

vi.mock('../prisma/db.js', () => {
  const makeQuery = (filters: Predicate[]): FakeQuery => ({
    where(arg) {
      if (typeof arg === 'function') {
        return makeQuery([
          ...filters,
          (role) =>
            arg({
              userRoles: {
                some: (callback) =>
                  role.userIds.some((userId) =>
                    callback({ userId: { eq: (value) => userId === value } }),
                  ),
              },
            }),
        ]);
      }

      return makeQuery([
        ...filters,
        (role) =>
          Object.entries(arg).every(
            ([key, value]) => (role as unknown as Record<string, unknown>)[key] === value,
          ),
      ]);
    },

    include() {
      return makeQuery(filters);
    },

    async all() {
      state.queries++;

      // কোয়েরি করার মুহূর্তের ডাটা (snapshot); পরে ডাটা বদলালেও এই ফল অপরিবর্তিত
      const rows = state.roles
        .filter((role) => filters.every((filter) => filter(role)))
        .map<FakeRow>((role) => ({
          id: role.id,
          organizationId: role.organizationId,
          name: role.name,
          status: role.status,
          permissions: role.permissions.map((code) => ({ permission: { code } })),
        }));

      const hold = state.holds.shift();

      if (hold) {
        await hold;
      }

      return rows;
    },
  });

  return { db: { orm: { public: { Role: makeQuery([]) } } } };
});

// ---------------------------------------------------------------------------

const ORG = 1;
const OTHER_ORG = 2;
const USER = 10;
const OTHER_USER = 11;

let nextRoleId = 1;

function role(partial: Partial<FakeRole> & Pick<FakeRole, 'name'>): FakeRole {
  return {
    id: nextRoleId++,
    organizationId: ORG,
    status: 'ACTIVE',
    userIds: [USER],
    permissions: [],
    ...partial,
  };
}

function makeService(ttlSeconds = 30): RbacService {
  process.env.RBAC_CACHE_TTL_SECONDS = String(ttlSeconds);

  return new RbacService();
}

describe('RbacService', () => {
  const originalTtl = process.env.RBAC_CACHE_TTL_SECONDS;

  beforeEach(() => {
    state.roles = [];
    state.queries = 0;
    state.holds = [];
    nextRoleId = 1;
  });

  afterEach(() => {
    vi.useRealTimers();

    if (originalTtl === undefined) {
      delete process.env.RBAC_CACHE_TTL_SECONDS;
    } else {
      process.env.RBAC_CACHE_TTL_SECONDS = originalTtl;
    }
  });

  describe('অনুমতি যাচাই (আচরণ)', () => {
    it('ইউজারের role-এর permission থাকলে true, না থাকলে false', async () => {
      state.roles = [
        role({ name: 'CASHIER', permissions: ['order.read', 'payment.create'] }),
      ];
      const service = makeService();

      expect(await service.hasPermission(USER, ORG, 'payment.create')).toBe(true);
      expect(await service.hasPermission(USER, ORG, 'payment.override')).toBe(false);
    });

    it('ADMIN পায়, CUSTOMER পায় না (payment.override)', async () => {
      state.roles = [
        role({ name: 'ADMIN', userIds: [USER], permissions: ['payment.override'] }),
        role({ name: 'CUSTOMER', userIds: [OTHER_USER], permissions: ['order.read'] }),
      ];
      const service = makeService();

      expect(await service.hasPermission(USER, ORG, 'payment.override')).toBe(true);
      expect(await service.hasPermission(OTHER_USER, ORG, 'payment.override')).toBe(false);
    });

    it.each(['INACTIVE', 'BLOCKED'] as const)(
      '%s role-এর permission ও role-নাম গণ্য হয় না',
      async (status) => {
        state.roles = [role({ name: 'ADMIN', status, permissions: ['payment.override'] })];
        const service = makeService();

        expect(await service.hasPermission(USER, ORG, 'payment.override')).toBe(false);
        expect(await service.hasRole(USER, ORG, 'ADMIN')).toBe(false);
      },
    );

    it('অন্য organization-এর role গণ্য হয় না', async () => {
      state.roles = [
        role({ name: 'ADMIN', organizationId: OTHER_ORG, permissions: ['payment.override'] }),
      ];
      const service = makeService();

      expect(await service.hasPermission(USER, ORG, 'payment.override')).toBe(false);
      expect(await service.hasRole(USER, ORG, 'ADMIN')).toBe(false);
      // সেই organization-এর context-এ ঠিকই পায়
      expect(await service.hasPermission(USER, OTHER_ORG, 'payment.override')).toBe(true);
    });

    it('ইউজারকে দেওয়া হয়নি এমন role গণ্য হয় না', async () => {
      state.roles = [
        role({ name: 'ADMIN', userIds: [OTHER_USER], permissions: ['payment.override'] }),
      ];
      const service = makeService();

      expect(await service.hasPermission(USER, ORG, 'payment.override')).toBe(false);
      expect(await service.hasRole(USER, ORG, 'ADMIN')).toBe(false);
    });

    it('hasRole শুধু নাম মেলা ACTIVE role-এ true', async () => {
      state.roles = [role({ name: 'MANAGER' })];
      const service = makeService();

      expect(await service.hasRole(USER, ORG, 'MANAGER')).toBe(true);
      expect(await service.hasRole(USER, ORG, 'ADMIN')).toBe(false);
    });

    it('একাধিক role-এর permission যুক্ত হয়', async () => {
      state.roles = [
        role({ name: 'CASHIER', permissions: ['order.read'] }),
        role({ name: 'WAREHOUSE', permissions: ['inventory.update'] }),
      ];
      const service = makeService();

      expect(await service.hasPermission(USER, ORG, 'order.read')).toBe(true);
      expect(await service.hasPermission(USER, ORG, 'inventory.update')).toBe(true);
      expect(await service.hasPermission(USER, ORG, 'invoice.create')).toBe(false);
    });

    it('requirePermission: না থাকলে ForbiddenException, থাকলে সফল', async () => {
      state.roles = [role({ name: 'CASHIER', permissions: ['order.read'] })];
      const service = makeService();

      await expect(service.requirePermission(USER, ORG, 'order.read')).resolves.toBeUndefined();
      await expect(service.requirePermission(USER, ORG, 'payment.override')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('কোয়েরি সংখ্যা ও cache', () => {
    it('প্রথম লোড ১টা কোয়েরি; TTL-এর মধ্যে পরের কলে ডাটাবেস ছোঁয় না', async () => {
      state.roles = [role({ name: 'ADMIN', permissions: ['payment.override', 'order.read'] })];
      const service = makeService();

      await service.hasPermission(USER, ORG, 'payment.override');
      await service.hasPermission(USER, ORG, 'order.read');
      await service.hasRole(USER, ORG, 'ADMIN');

      expect(state.queries).toBe(1);
    });

    it('একসাথে ১৫টা কল এলে লোড একবারই হয়', async () => {
      state.roles = [role({ name: 'ADMIN', permissions: ['payment.override'] })];
      const service = makeService();

      const results = await Promise.all(
        Array.from({ length: 15 }, () => service.hasPermission(USER, ORG, 'payment.override')),
      );

      expect(results.every(Boolean)).toBe(true);
      expect(state.queries).toBe(1);
    });

    it('TTL শেষ হলে আবার লোড হয়', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      state.roles = [role({ name: 'CASHIER', permissions: ['order.read'] })];
      const service = makeService(30);

      await service.hasPermission(USER, ORG, 'order.read');
      vi.setSystemTime(Date.now() + 29_000);
      await service.hasPermission(USER, ORG, 'order.read');
      expect(state.queries).toBe(1);

      vi.setSystemTime(Date.now() + 2_000); // মোট ৩১ সেকেন্ড
      await service.hasPermission(USER, ORG, 'order.read');
      expect(state.queries).toBe(2);
    });

    it('TTL=0 হলে cache বন্ধ: প্রতি কলে কোয়েরি', async () => {
      state.roles = [role({ name: 'CASHIER', permissions: ['order.read'] })];
      const service = makeService(0);

      await service.hasPermission(USER, ORG, 'order.read');
      await service.hasPermission(USER, ORG, 'order.read');

      expect(state.queries).toBe(2);
    });

    it('role-হীন ইউজার cache হয় না: নতুন role সঙ্গে সঙ্গে দেখা যায়', async () => {
      const service = makeService();

      expect(await service.hasPermission(USER, ORG, 'order.read')).toBe(false);

      state.roles = [role({ name: 'CASHIER', permissions: ['order.read'] })];

      expect(await service.hasPermission(USER, ORG, 'order.read')).toBe(true);
    });

    it('অবৈধ RBAC_CACHE_TTL_SECONDS হলে constructor এরর দেয়', () => {
      process.env.RBAC_CACHE_TTL_SECONDS = '-5';
      expect(() => new RbacService()).toThrow();

      process.env.RBAC_CACHE_TTL_SECONDS = 'abc';
      expect(() => new RbacService()).toThrow();
    });
  });

  describe('invalidate', () => {
    it('invalidateUser: cache মুছে নতুন ডাটা দেখায়', async () => {
      state.roles = [role({ name: 'ADMIN', permissions: ['payment.override'] })];
      const service = makeService();

      expect(await service.hasPermission(USER, ORG, 'payment.override')).toBe(true);

      state.roles = []; // role সরানো হলো
      expect(await service.hasPermission(USER, ORG, 'payment.override')).toBe(true); // এখনো cache

      service.invalidateUser(USER, ORG);
      expect(await service.hasPermission(USER, ORG, 'payment.override')).toBe(false);
    });

    it('invalidateUser (organization ছাড়া): ওই ইউজারের সব organization মোছে, অন্যদের নয়', async () => {
      state.roles = [
        role({ name: 'ADMIN', organizationId: ORG, permissions: ['a'] }),
        role({ name: 'ADMIN', organizationId: OTHER_ORG, permissions: ['a'] }),
        role({ name: 'CASHIER', organizationId: ORG, userIds: [OTHER_USER], permissions: ['a'] }),
      ];
      const service = makeService();

      await service.hasPermission(USER, ORG, 'a');
      await service.hasPermission(USER, OTHER_ORG, 'a');
      await service.hasPermission(OTHER_USER, ORG, 'a');
      expect(state.queries).toBe(3);

      service.invalidateUser(USER);

      await service.hasPermission(USER, ORG, 'a'); // আবার লোড
      await service.hasPermission(USER, OTHER_ORG, 'a'); // আবার লোড
      await service.hasPermission(OTHER_USER, ORG, 'a'); // cache থেকে
      expect(state.queries).toBe(5);
    });

    it('invalidateAll: সবার cache মোছে', async () => {
      state.roles = [role({ name: 'CASHIER', permissions: ['order.read'] })];
      const service = makeService();

      await service.hasPermission(USER, ORG, 'order.read');
      service.invalidateAll();
      await service.hasPermission(USER, ORG, 'order.read');

      expect(state.queries).toBe(2);
    });

    it('race: লোড চলাকালীন invalidate হলে পরের কল পুরনো ফল পায় না, পুরনো ফল cache-ও হয় না', async () => {
      state.roles = [role({ name: 'ADMIN', permissions: ['payment.override'] })];
      const service = makeService();

      // প্রথম লোড আটকে রাখি; সে এই মুহূর্তের (পুরনো) ডাটা snapshot করে ফেলেছে
      let release: () => void = () => {};
      state.holds.push(
        new Promise<void>((resolve) => {
          release = resolve;
        }),
      );
      const inFlight = service.hasPermission(USER, ORG, 'payment.override');

      // ইতিমধ্যে ADMIN role সরানো হলো এবং invalidate ডাকা হলো
      state.roles = [role({ name: 'CASHIER', permissions: ['order.read'] })];
      service.invalidateUser(USER, ORG);

      // নতুন কল অবশ্যই নতুন লোড করবে (চলমান পুরনো প্রমিসে জুড়বে না)
      expect(await service.hasPermission(USER, ORG, 'payment.override')).toBe(false);
      expect(state.queries).toBe(2);

      // এবার পুরনো লোড শেষ হোক: তার ফল cache-এ বসা চলবে না
      release();
      expect(await inFlight).toBe(true); // আগে থেকে অপেক্ষায় থাকা কলারের ফল পুরনোই (গ্রহণযোগ্য)

      expect(await service.hasPermission(USER, ORG, 'payment.override')).toBe(false);
      expect(await service.hasPermission(USER, ORG, 'order.read')).toBe(true);
      expect(state.queries).toBe(2); // নতুন লোডের ফল cache থেকে এসেছে, পুরনোটা cache হয়নি
    });
  });
});