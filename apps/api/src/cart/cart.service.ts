import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { db } from '../prisma/db.js';

import type {
    AddCartItemDto,
    CreateCartDto,
    UpdateCartItemDto,
} from './cart.dto.js';

@Injectable()
export class CartService {
  private async validateCustomer(
    organizationId: number,
    customerId: number,
  ) {
    const customer =
      await db.orm.public.Customer
        .where({
          id: customerId,
          organizationId,
        })
        .first();

    if (!customer) {
      throw new NotFoundException(
        'Customer not found',
      );
    }

    return customer;
  }

  private async validateVariant(
    organizationId: number,
    productVariantId: number,
  ) {
    const variant =
      await db.orm.public.ProductVariant
        .where({
          id: productVariantId,
        })
        .first();

    if (!variant) {
      throw new NotFoundException(
        'Product variant not found',
      );
    }

    const product =
      await db.orm.public.Product
        .where({
          id: variant.productId,
          organizationId,
        })
        .first();

    if (!product) {
      throw new NotFoundException(
        'Product variant not found',
      );
    }

    return variant;
  }

  private async getCart(
    organizationId: number,
    cartId: number,
  ) {
    const cart =
      await db.orm.public.Cart
        .where({
          id: cartId,
          organizationId,
        })
        .first();

    if (!cart) {
      throw new NotFoundException(
        'Cart not found',
      );
    }

    return cart;
  }

  async createOrGetCart(
    organizationId: number,
    dto: CreateCartDto,
  ) {
    if (!dto.customerId && !dto.guestSessionId) {
      throw new BadRequestException(
        'customerId or guestSessionId is required',
      );
    }

    if (
      dto.customerId &&
      dto.guestSessionId
    ) {
      throw new BadRequestException(
        'Use either customerId or guestSessionId, not both',
      );
    }

    if (dto.customerId) {
      await this.validateCustomer(
        organizationId,
        dto.customerId,
      );

      const existing =
        await db.orm.public.Cart
          .where({
            organizationId,
            customerId: dto.customerId,
            status: 'ACTIVE',
          })
          .first();

      if (existing) {
        return existing;
      }

      return db.orm.public.Cart.create({
        organizationId,
        customerId: dto.customerId,
        status: 'ACTIVE',
        currency: 'BDT',
      });
    }

    const existing =
      await db.orm.public.Cart
        .where({
          organizationId,
          guestSessionId:
            dto.guestSessionId,
          status: 'ACTIVE',
        })
        .first();

    if (existing) {
      return existing;
    }

    return db.orm.public.Cart.create({
      organizationId,
      guestSessionId:
        dto.guestSessionId,
      status: 'ACTIVE',
      currency: 'BDT',
    });
  }

  async getActiveCart(
    organizationId: number,
    customerId?: number,
    guestSessionId?: string,
  ) {
    if (!customerId && !guestSessionId) {
      throw new BadRequestException(
        'customerId or guestSessionId is required',
      );
    }

    if (customerId) {
      await this.validateCustomer(
        organizationId,
        customerId,
      );

      const cart =
        await db.orm.public.Cart
          .where({
            organizationId,
            customerId,
            status: 'ACTIVE',
          })
          .first();

      if (!cart) {
        throw new NotFoundException(
          'Active cart not found',
        );
      }

      return cart;
    }

    const cart =
      await db.orm.public.Cart
        .where({
          organizationId,
          guestSessionId,
          status: 'ACTIVE',
        })
        .first();

    if (!cart) {
      throw new NotFoundException(
        'Active cart not found',
      );
    }

    return cart;
  }

  async addItem(
    organizationId: number,
    cartId: number,
    dto: AddCartItemDto,
  ) {
    const cart =
      await this.getCart(
        organizationId,
        cartId,
      );

    if (cart.status !== 'ACTIVE') {
      throw new ConflictException(
        'Cart is not active',
      );
    }

    await this.validateVariant(
      organizationId,
      dto.productVariantId,
    );

    const existing =
      await db.orm.public.CartItem
        .where({
          cartId,
          productVariantId:
            dto.productVariantId,
        })
        .first();

    if (existing) {
      const updated =
        await db.orm.public.CartItem
          .where({
            id: existing.id,
          })
          .update({
            quantity:
              existing.quantity +
              dto.quantity,
          });

      if (!updated) {
        throw new NotFoundException(
          'Cart item not found',
        );
      }

      return updated;
    }

    return db.orm.public.CartItem.create({
      cartId,
      productVariantId:
        dto.productVariantId,
      quantity: dto.quantity,
    });
  }

  async listItems(
    organizationId: number,
    cartId: number,
  ) {
    await this.getCart(
      organizationId,
      cartId,
    );

    return db.orm.public.CartItem
      .where({
        cartId,
      })
      .all();
  }

  async updateItem(
    organizationId: number,
    cartId: number,
    itemId: number,
    dto: UpdateCartItemDto,
  ) {
    const cart =
      await this.getCart(
        organizationId,
        cartId,
      );

    if (cart.status !== 'ACTIVE') {
      throw new ConflictException(
        'Cart is not active',
      );
    }

    const item =
      await db.orm.public.CartItem
        .where({
          id: itemId,
          cartId,
        })
        .first();

    if (!item) {
      throw new NotFoundException(
        'Cart item not found',
      );
    }

    const updated =
      await db.orm.public.CartItem
        .where({
          id: itemId,
        })
        .update({
          quantity: dto.quantity,
        });

    if (!updated) {
      throw new NotFoundException(
        'Cart item not found',
      );
    }

    return updated;
  }

  async removeItem(
    organizationId: number,
    cartId: number,
    itemId: number,
  ) {
    await this.getCart(
      organizationId,
      cartId,
    );

    const item =
      await db.orm.public.CartItem
        .where({
          id: itemId,
          cartId,
        })
        .first();

    if (!item) {
      throw new NotFoundException(
        'Cart item not found',
      );
    }

    const deleted =
      await db.orm.public.CartItem
        .where({
          id: itemId,
        })
        .delete();

    if (!deleted) {
      throw new NotFoundException(
        'Cart item not found',
      );
    }

    return deleted;
  }

  async clearCart(
    organizationId: number,
    cartId: number,
  ) {
    const cart =
      await this.getCart(
        organizationId,
        cartId,
      );

    if (cart.status !== 'ACTIVE') {
      throw new ConflictException(
        'Cart is not active',
      );
    }

   const deletedCount =
  await db.orm.public.CartItem
    .where({
      cartId,
    })
    .deleteAndCount();
    return {
      cartId,
      deletedCount,
    };
  }
}