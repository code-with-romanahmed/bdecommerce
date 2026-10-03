import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { db } from '../prisma/db.js';

import type {
  StockAdjustmentDto,
  StockInDto,
  StockOutDto,
  StockTransferDto,
} from './inventory.dto.js';
@Injectable()
export class InventoryService {
  private async validateBranch(
    organizationId: number,
    branchId: number,
  ) {
    const branch = await db.orm.public.Branch
      .where({
        id: branchId,
        organizationId,
      })
      .first();

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    return branch;
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

  async stockIn(
    organizationId: number,
    dto: StockInDto,
  ) {
    await this.validateBranch(
      organizationId,
      dto.branchId,
    );

    await this.validateVariant(
      organizationId,
      dto.productVariantId,
    );

    let stock =
      await db.orm.public.InventoryStock
        .where({
          branchId: dto.branchId,
          productVariantId: dto.productVariantId,
          organizationId,
        })
        .first();

    if (!stock) {
      stock =
        await db.orm.public.InventoryStock.create({
          organizationId,
          branchId: dto.branchId,
          productVariantId: dto.productVariantId,
          quantity: dto.quantity,
        });
    } else {
      const updatedStock =
        await db.orm.public.InventoryStock
          .where({
            id: stock.id,
          })
          .update({
            quantity:
              stock.quantity + dto.quantity,
          });

      if (!updatedStock) {
        throw new NotFoundException(
          'Inventory stock not found',
        );
      }

      stock = updatedStock;
    }

    const movement =
      await db.orm.public.StockMovement.create({
        organizationId,
        branchId: dto.branchId,
        productVariantId: dto.productVariantId,
        inventoryStockId: stock.id,
        type: 'IN',
        quantity: dto.quantity,
        referenceType: dto.referenceType,
        referenceId: dto.referenceId,
        note: dto.note,
      });

    return {
      stock,
      movement,
    };
  }

  async stockOut(
    organizationId: number,
    dto: StockOutDto,
  ) {
    await this.validateBranch(
      organizationId,
      dto.branchId,
    );

    await this.validateVariant(
      organizationId,
      dto.productVariantId,
    );

    const stock =
      await db.orm.public.InventoryStock
        .where({
          branchId: dto.branchId,
          productVariantId: dto.productVariantId,
          organizationId,
        })
        .first();

    if (!stock) {
      throw new BadRequestException(
        'No inventory stock found',
      );
    }

    const availableQuantity =
      stock.quantity - stock.reservedQuantity;

    if (dto.quantity > availableQuantity) {
      throw new BadRequestException(
        'Insufficient available stock',
      );
    }

    const updatedStock =
      await db.orm.public.InventoryStock
        .where({
          id: stock.id,
        })
        .update({
          quantity:
            stock.quantity - dto.quantity,
        });

    if (!updatedStock) {
      throw new NotFoundException(
        'Inventory stock not found',
      );
    }

    const movement =
      await db.orm.public.StockMovement.create({
        organizationId,
        branchId: dto.branchId,
        productVariantId: dto.productVariantId,
        inventoryStockId: updatedStock.id,
        type: 'OUT',
        quantity: dto.quantity,
        referenceType: dto.referenceType,
        referenceId: dto.referenceId,
        note: dto.note,
      });

    return {
      stock: updatedStock,
      movement,
    };
  }

  async adjustStock(
    organizationId: number,
    dto: StockAdjustmentDto,
  ) {
    await this.validateBranch(
      organizationId,
      dto.branchId,
    );

    await this.validateVariant(
      organizationId,
      dto.productVariantId,
    );

    const stock =
      await db.orm.public.InventoryStock
        .where({
          organizationId,
          branchId: dto.branchId,
          productVariantId: dto.productVariantId,
        })
        .first();

    if (!stock) {
      throw new NotFoundException(
        'Inventory stock not found',
      );
    }

    const newQuantity =
      stock.quantity + dto.quantity;

    if (newQuantity < 0) {
      throw new BadRequestException(
        'Adjustment would make stock negative',
      );
    }

    if (
      newQuantity <
      stock.reservedQuantity
    ) {
      throw new BadRequestException(
        'Adjustment would reduce stock below reserved quantity',
      );
    }

    const updatedStock =
      await db.orm.public.InventoryStock
        .where({
          id: stock.id,
        })
        .update({
          quantity: newQuantity,
        });

    if (!updatedStock) {
      throw new NotFoundException(
        'Inventory stock not found',
      );
    }

    const movement =
      await db.orm.public.StockMovement.create({
        organizationId,
        branchId: dto.branchId,
        productVariantId: dto.productVariantId,
        inventoryStockId: updatedStock.id,
        type: 'ADJUSTMENT',
        quantity: dto.quantity,
        note: dto.note,
      });

    return {
      stock: updatedStock,
      movement,
    };
  }
async transferStock(
  organizationId: number,
  dto: StockTransferDto,
) {
  if (dto.fromBranchId === dto.toBranchId) {
    throw new BadRequestException(
      'Source and destination branch must be different',
    );
  }

  await this.validateBranch(
    organizationId,
    dto.fromBranchId,
  );

  await this.validateBranch(
    organizationId,
    dto.toBranchId,
  );

  await this.validateVariant(
    organizationId,
    dto.productVariantId,
  );

  return db.transaction(async (tx) => {
    const sourceStock =
      await tx.orm.public.InventoryStock
        .where({
          organizationId,
          branchId: dto.fromBranchId,
          productVariantId: dto.productVariantId,
        })
        .first();

    if (!sourceStock) {
      throw new BadRequestException(
        'No source inventory stock found',
      );
    }

    const availableQuantity =
      sourceStock.quantity -
      sourceStock.reservedQuantity;

    if (dto.quantity > availableQuantity) {
      throw new BadRequestException(
        'Insufficient available stock for transfer',
      );
    }

    const updatedSourceStock =
      await tx.orm.public.InventoryStock
        .where({
          id: sourceStock.id,
        })
        .update({
          quantity:
            sourceStock.quantity - dto.quantity,
        });

    if (!updatedSourceStock) {
      throw new NotFoundException(
        'Source inventory stock not found',
      );
    }

    let destinationStock =
      await tx.orm.public.InventoryStock
        .where({
          organizationId,
          branchId: dto.toBranchId,
          productVariantId: dto.productVariantId,
        })
        .first();

    if (!destinationStock) {
      destinationStock =
        await tx.orm.public.InventoryStock.create({
          organizationId,
          branchId: dto.toBranchId,
          productVariantId:
            dto.productVariantId,
          quantity: dto.quantity,
        });
    } else {
      const updatedDestinationStock =
        await tx.orm.public.InventoryStock
          .where({
            id: destinationStock.id,
          })
          .update({
            quantity:
              destinationStock.quantity +
              dto.quantity,
          });

      if (!updatedDestinationStock) {
        throw new NotFoundException(
          'Destination inventory stock not found',
        );
      }

      destinationStock =
        updatedDestinationStock;
    }

    const transferReference =
      `TRANSFER:${dto.fromBranchId}->${dto.toBranchId}`;

    const transferOutMovement =
      await tx.orm.public.StockMovement.create({
        organizationId,
        branchId: dto.fromBranchId,
        productVariantId:
          dto.productVariantId,
        inventoryStockId:
          updatedSourceStock.id,
        type: 'TRANSFER_OUT',
        quantity: dto.quantity,
        referenceType:
          transferReference,
        note: dto.note,
      });

    const transferInMovement =
      await tx.orm.public.StockMovement.create({
        organizationId,
        branchId: dto.toBranchId,
        productVariantId:
          dto.productVariantId,
        inventoryStockId:
          destinationStock.id,
        type: 'TRANSFER_IN',
        quantity: dto.quantity,
        referenceType:
          transferReference,
        note: dto.note,
      });

    return {
      sourceStock: updatedSourceStock,
      destinationStock,
      transferOutMovement,
      transferInMovement,
    };
  });
}
  async listStocks(organizationId: number) {
    return db.orm.public.InventoryStock
      .where({
        organizationId,
      })
      .all();
  }

  async getStock(
    organizationId: number,
    productVariantId: number,
  ) {
    const variant =
      await this.validateVariant(
        organizationId,
        productVariantId,
      );

    return db.orm.public.InventoryStock
      .where({
        organizationId,
        productVariantId: variant.id,
      })
      .all();
  }

  // ১. অর্ডার তৈরির সময়ে স্টক রিজার্ভ করার লজিক
  async reserveStockForOrder(
    organizationId: number,
    branchId: number,
    items: { productVariantId: number; quantity: number }[],
    tx?: any,
  ) {
    const client = tx || db;

    for (const item of items) {
      const stock = await client.orm.public.InventoryStock
        .where({
          organizationId,
          branchId,
          productVariantId: item.productVariantId,
        })
        .first();

      if (!stock) {
        throw new BadRequestException(
          `Stock record not found for variant ID: ${item.productVariantId}`,
        );
      }

      const availableQuantity = stock.quantity - stock.reservedQuantity;

      if (availableQuantity < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for variant ID: ${item.productVariantId}. Available: ${availableQuantity}`,
        );
      }

      // reservedQuantity বাড়িয়ে দেওয়া হচ্ছে
      await client.orm.public.InventoryStock
        .where({ id: stock.id })
        .update({
          reservedQuantity: stock.reservedQuantity + item.quantity,
        });
    }
  }

  // ২. অর্ডার ক্যানসেল হলে স্টক রিলিজ/রিস্টোর করার লজিক
  async releaseStockForOrder(
    organizationId: number,
    branchId: number,
    items: { productVariantId: number; quantity: number }[],
    tx?: any,
  ) {
    const client = tx || db;

    for (const item of items) {
      const stock = await client.orm.public.InventoryStock
        .where({
          organizationId,
          branchId,
          productVariantId: item.productVariantId,
        })
        .first();

      if (stock) {
        // reservedQuantity কমিয়ে স্বাভাবিক অবস্থায় নিয়ে যাওয়া
        const newReserved = Math.max(0, stock.reservedQuantity - item.quantity);

        await client.orm.public.InventoryStock
          .where({ id: stock.id })
          .update({
            reservedQuantity: newReserved,
          });
      }
    }
  }

  // ৩. ডেলিভারি বা কনফার্মেশনের সময় মূল Stock থেকে স্থায়ীভাবে Deduct করার লজিক
  async deductStockForOrder(
    organizationId: number,
    branchId: number,
    orderId: number,
    items: { productVariantId: number; quantity: number }[],
    tx?: any,
  ) {
    const client = tx || db;

    for (const item of items) {
      const stock = await client.orm.public.InventoryStock
        .where({
          organizationId,
          branchId,
          productVariantId: item.productVariantId,
        })
        .first();

      if (!stock) {
        throw new BadRequestException(
          `Stock not found for variant ID: ${item.productVariantId}`,
        );
      }

      const newReserved = Math.max(0, stock.reservedQuantity - item.quantity);
      const newQuantity = stock.quantity - item.quantity;

      if (newQuantity < 0) {
        throw new BadRequestException('Stock deduction resulted in negative value');
      }

      // Stock কমানো
      const updatedStock = await client.orm.public.InventoryStock
        .where({ id: stock.id })
        .update({
          quantity: newQuantity,
          reservedQuantity: newReserved,
        });

      // OUT Movement লগ করা
      await client.orm.public.StockMovement.create({
        organizationId,
        branchId,
        productVariantId: item.productVariantId,
        inventoryStockId: updatedStock.id,
        type: 'OUT',
        quantity: item.quantity,
        referenceType: 'ORDER',
        referenceId: orderId,
        note: `Stock deducted for Order ID: ${orderId}`,
      });
    }
  }
}
