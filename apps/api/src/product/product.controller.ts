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
import { CreateCategoryDto } from './category.dto.js';
import { CreateProductVariantDto } from './product-variant.dto.js';
import { CreateProductDto } from './product.dto.js';
import { ProductService } from './product.service.js';

@Controller('products')
@UseGuards(JwtAuthGuard,PermissionGuard)
export class ProductController {
  constructor(
    private readonly productService: ProductService,
  ) {}

  @Post('categories')
  @RequirePermission('product.create')
  async createCategory(
    @OrganizationId() organizationId: number,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.productService.createCategory(
      organizationId,
      dto,
    );
  }

  @Get('categories')
  @RequirePermission('product.read')
  async listCategories(
    @OrganizationId() organizationId: number,
  ) {
    return this.productService.listCategories(
      organizationId,
    );
  }

  @Post()
  @RequirePermission('product.create')
  async createProduct(
    @OrganizationId() organizationId: number,
    @Body() dto: CreateProductDto,
  ) {
    return this.productService.createProduct(
      organizationId,
      dto,
    );
  }

  @Get()
  @RequirePermission('product.read')
  async listProducts(
    @OrganizationId() organizationId: number,
  ) {
    return this.productService.listProducts(
      organizationId,
    );
  }

  @Post(':productId/variants')
  @RequirePermission('product.update')
  async createVariant(
    @OrganizationId() organizationId: number,

    @Param('productId', ParseIntPipe)
    productId: number,

    @Body()
    dto: CreateProductVariantDto,
  ) {
    return this.productService.createVariant(
      organizationId,
      productId,
      dto,
    );
  }

  @Get(':productId/variants')
  @RequirePermission('product.read')
  async listVariants(
    @OrganizationId() organizationId: number,

    @Param('productId', ParseIntPipe)
    productId: number,
  ) {
    return this.productService.listVariants(
      organizationId,
      productId,
    );
  }
}