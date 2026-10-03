import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationId } from '../auth/organization-context.decorator.js';
import { RequirePermission } from '../rbac/permission.decorator.js';
import { PermissionGuard } from '../rbac/permission.guard.js';

import {
  StockAdjustmentDto,
  StockInDto,
  StockOutDto,
  StockTransferDto,
} from './inventory.dto.js';

import { InventoryService } from './inventory.service.js';

@Controller('inventory')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
  ) {}

  @Post('stock-in')
  @RequirePermission('inventory.update')
  async stockIn(
    @OrganizationId() organizationId: number,
    @Body() dto: StockInDto,
  ) {
    return this.inventoryService.stockIn(
      organizationId,
      dto,
    );
  }

  @Post('stock-out')
  @RequirePermission('inventory.update')
  async stockOut(
    @OrganizationId() organizationId: number,
    @Body() dto: StockOutDto,
  ) {
    return this.inventoryService.stockOut(
      organizationId,
      dto,
    );
  }

  @Post('adjust')
  @RequirePermission('inventory.update')
  async adjustStock(
    @OrganizationId() organizationId: number,
    @Body() dto: StockAdjustmentDto,
  ) {
    return this.inventoryService.adjustStock(
      organizationId,
      dto,
    );
  }

  @Post('transfer')
  @RequirePermission('inventory.update')
  async transferStock(
    @OrganizationId() organizationId: number,
    @Body() dto: StockTransferDto,
  ) {
    return this.inventoryService.transferStock(
      organizationId,
      dto,
    );
  }

  @Get('stocks')
  @RequirePermission('inventory.read')
  async listStocks(
    @OrganizationId() organizationId: number,
  ) {
    return this.inventoryService.listStocks(
      organizationId,
    );
  }

  @Get('stocks/:productVariantId')
  @RequirePermission('inventory.read')
  async getStock(
    @OrganizationId() organizationId: number,
    @Param(
      'productVariantId',
      ParseIntPipe,
    )
    productVariantId: number,
  ) {
    return this.inventoryService.getStock(
      organizationId,
      productVariantId,
    );
  }
}