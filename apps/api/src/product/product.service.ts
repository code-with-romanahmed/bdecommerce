import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { Numeric } from '@prisma/orm-postgres/target/codec-types';
import {
  parseFields,
  pickFields,
  type PaginatedResult,
  type PaginationQueryDto,
} from '../common/Pagination query.dto.js';
import { db } from '../prisma/db.js';
import { RedisService } from '../redis/redis.service.js';
import type { CreateCategoryDto } from './category.dto.js';
import type { CreateProductVariantDto } from './product-variant.dto.js';
import type { CreateProductDto } from './product.dto.js';

// ক্যাটাগরি কম বদলায়, তাই ৫ মিনিট cache রাখা নিরাপদ। প্রোডাক্ট/ভ্যারিয়েন্ট
// cache করিনি — stock/price ঘনঘন বদলায়, stale data দেখানোর ঝুঁকি থাকে।
const CATEGORY_CACHE_TTL_SECONDS = 300;

function categoryCacheKey(organizationId: number): string {
  return `cache:categories:${organizationId}`;
}

@Injectable()
export class ProductService {
  constructor(private readonly redisService: RedisService) {}

  async createCategory(
    organizationId: number,
    dto: CreateCategoryDto,
  ) {
    const existing =
      await db.orm.public.Category
        .where({
          organizationId,
          slug: dto.slug,
        })
        .first();

    if (existing) {
      throw new ConflictException(
        'Category slug already exists',
      );
    }

    const category = await db.orm.public.Category.create({
      organizationId,
      name: dto.name,
      slug: dto.slug,
    });

    // নতুন ক্যাটাগরি তৈরি হলে পুরনো cached list আর valid না —
    // del করে দিচ্ছি, পরের read-এ fresh data দিয়ে cache আবার বসবে।
    await this.redisService
      .getClient()
      .del(categoryCacheKey(organizationId));

    return category;
  }

  // পুরো org-এর ক্যাটাগরি লিস্ট (unpaginated) cache থেকে পড়ে, না থাকলে
  // DB থেকে fetch করে cache-এ বসায়। ক্যাটাগরি সাধারণত কম সংখ্যায় থাকে,
  // তাই পুরো লিস্ট cache করে pagination/field-filter in-memory করাই সহজ —
  // এতে cache-invalidation-এর জন্য একটাই key (per org) থাকে।
  private async getAllCategoriesCached(organizationId: number) {
    const key = categoryCacheKey(organizationId);
    const client = this.redisService.getClient();

    const cached = await client.get(key);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // corrupted/old-shape cache হলে ignore করে fresh fetch-এ fallback
      }
    }

    const fresh = await db.orm.public.Category
      .where({ organizationId })
      .orderBy((c) => c.id.asc())
      .all();

    await client.set(
      key,
      JSON.stringify(fresh),
      'EX',
      CATEGORY_CACHE_TTL_SECONDS,
    );

    return fresh;
  }

  async listCategories(
    organizationId: number,
    pagination: PaginationQueryDto = {},
  ): Promise<PaginatedResult<any>> {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const offset = (page - 1) * limit;

    const allCategories =
      await this.getAllCategoriesCached(organizationId);

    const total = allCategories.length;
    const pageRows = allCategories.slice(
      offset,
      offset + limit,
    );

    return {
      data: pickFields(
        pageRows,
        parseFields(pagination.fields),
      ),
      page,
      limit,
      total,
      totalPages: Math.max(
        1,
        Math.ceil(total / limit),
      ),
    };
  }

  async createProduct(
    organizationId: number,
    dto: CreateProductDto,
  ) {
    const existing =
      await db.orm.public.Product
        .where({
          organizationId,
          slug: dto.slug,
        })
        .first();

    if (existing) {
      throw new ConflictException(
        'Product slug already exists',
      );
    }

    if (dto.categoryId) {
      const category =
        await db.orm.public.Category
          .where({
            id: dto.categoryId,
            organizationId,
          })
          .first();

      if (!category) {
        throw new NotFoundException(
          'Category not found',
        );
      }
    }

    return db.orm.public.Product.create({
      organizationId,
      categoryId: dto.categoryId,
      name: dto.name,
      slug: dto.slug,
      description: dto.description,
    });
  }

  async listProducts(
    organizationId: number,
    pagination: PaginationQueryDto = {},
  ): Promise<PaginatedResult<any>> {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const offset = (page - 1) * limit;

    const [data, { count: total }] = await Promise.all([
      db.orm.public.Product
        .where({ organizationId })
        .orderBy((p) => p.id.asc())
        .limit(limit)
        .offset(offset)
        .all(),
      db.orm.public.Product
        .where({ organizationId })
        .aggregate((a) => ({ count: a.count() })),
    ]);

    return {
      data: pickFields(
        data,
        parseFields(pagination.fields),
      ),
      page,
      limit,
      total,
      totalPages: Math.max(
        1,
        Math.ceil(total / limit),
      ),
    };
  }

  async createVariant(
    organizationId: number,
    productId: number,
    dto: CreateProductVariantDto,
  ) {
    const product =
      await db.orm.public.Product
        .where({
          id: productId,
          organizationId,
        })
        .first();

    if (!product) {
      throw new NotFoundException(
        'Product not found',
      );
    }

    const existing =
      await db.orm.public.ProductVariant
        .where({
          organizationId,
          sku: dto.sku,
        })
        .first();

    if (existing) {
      throw new ConflictException(
        'SKU already exists',
      );
    }

    return db.orm.public.ProductVariant.create({
      organizationId,
      productId,
      sku: dto.sku,
      name: dto.name,
      price: dto.price as Numeric<10, 2>,
    });
  }

  async listVariants(
    organizationId: number,
    productId: number,
    pagination: PaginationQueryDto = {},
  ): Promise<PaginatedResult<any>> {
    const product =
      await db.orm.public.Product
        .where({
          id: productId,
          organizationId,
        })
        .first();

    if (!product) {
      throw new NotFoundException(
        'Product not found',
      );
    }

    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const offset = (page - 1) * limit;

    const [data, { count: total }] = await Promise.all([
      db.orm.public.ProductVariant
        .where({ productId })
        .orderBy((v) => v.id.asc())
        .limit(limit)
        .offset(offset)
        .all(),
      db.orm.public.ProductVariant
        .where({ productId })
        .aggregate((a) => ({ count: a.count() })),
    ]);

    return {
      data: pickFields(
        data,
        parseFields(pagination.fields),
      ),
      page,
      limit,
      total,
      totalPages: Math.max(
        1,
        Math.ceil(total / limit),
      ),
    };
  }
}