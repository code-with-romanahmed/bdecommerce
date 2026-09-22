import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationId } from '../auth/organization-context.decorator.js';
import { RequirePermission } from '../rbac/permission.decorator.js';
import { PermissionGuard } from '../rbac/permission.guard.js';

import {
  AddCartItemDto,
  CreateCartDto,
  UpdateCartItemDto,
} from './cart.dto.js';

import { CartService } from './cart.service.js';

@Controller('carts')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class CartController {
  constructor(
    private readonly cartService: CartService,
  ) {}

  @Post()
  @RequirePermission('cart.update')
  async createOrGetCart(
    @OrganizationId() organizationId: number,
    @Body() dto: CreateCartDto,
  ) {
    return this.cartService.createOrGetCart(
      organizationId,
      dto,
    );
  }

  @Get('active')
  @RequirePermission('cart.read')
  async getActiveCart(
    @OrganizationId() organizationId: number,
    @Query('customerId')
    customerId?: string,
    @Query('guestSessionId')
    guestSessionId?: string,
  ) {
    return this.cartService.getActiveCart(
      organizationId,
      customerId
        ? Number(customerId)
        : undefined,
      guestSessionId,
    );
  }

  @Post(':cartId/items')
  @RequirePermission('cart.update')
  async addItem(
    @OrganizationId() organizationId: number,
    @Param('cartId', ParseIntPipe)
    cartId: number,
    @Body() dto: AddCartItemDto,
  ) {
    return this.cartService.addItem(
      organizationId,
      cartId,
      dto,
    );
  }

  @Get(':cartId/items')
  @RequirePermission('cart.read')
  async listItems(
    @OrganizationId() organizationId: number,
    @Param('cartId', ParseIntPipe)
    cartId: number,
  ) {
    return this.cartService.listItems(
      organizationId,
      cartId,
    );
  }

  @Patch(':cartId/items/:itemId')
  @RequirePermission('cart.update')
  async updateItem(
    @OrganizationId() organizationId: number,
    @Param('cartId', ParseIntPipe)
    cartId: number,
    @Param('itemId', ParseIntPipe)
    itemId: number,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(
      organizationId,
      cartId,
      itemId,
      dto,
    );
  }

  @Delete(':cartId/items/:itemId')
  @RequirePermission('cart.update')
  async removeItem(
    @OrganizationId() organizationId: number,
    @Param('cartId', ParseIntPipe)
    cartId: number,
    @Param('itemId', ParseIntPipe)
    itemId: number,
  ) {
    return this.cartService.removeItem(
      organizationId,
      cartId,
      itemId,
    );
  }

  @Delete(':cartId/items')
  @RequirePermission('cart.update')
  async clearCart(
    @OrganizationId() organizationId: number,
    @Param('cartId', ParseIntPipe)
    cartId: number,
  ) {
    return this.cartService.clearCart(
      organizationId,
      cartId,
    );
  }
}