import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { db } from '../prisma/db.js';

import type { CreateCategoryDto } from './category.dto.js';
import type { CreateProductVariantDto } from './product-variant.dto.js';
import type { CreateProductDto } from './product.dto.js';

@Injectable()
export class ProductService {

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

    return db.orm.public.Category.create({
      organizationId,
      name: dto.name,
      slug: dto.slug,
    });
  }

  async listCategories(
    organizationId: number,
  ) {
    return db.orm.public.Category
      .where({ organizationId })
      .all();
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
  ) {
    return db.orm.public.Product
      .where({ organizationId })
      .all();
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
          sku: dto.sku,
        })
        .first();

    if (existing) {
      throw new ConflictException(
        'SKU already exists',
      );
    }

    return db.orm.public.ProductVariant.create({
      productId,
      sku: dto.sku,
      name: dto.name,
      price: dto.price,
    });
  }

  async listVariants(
    organizationId: number,
    productId: number,
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

    return db.orm.public.ProductVariant
      .where({ productId })
      .all();
  }
}