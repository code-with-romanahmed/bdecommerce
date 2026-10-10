import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationId } from '../auth/organization-context.decorator.js';
import { PaginationQueryDto } from '../common/Pagination query.dto.js';
import { RequirePermission } from '../rbac/permission.decorator.js';
import { PermissionGuard } from '../rbac/permission.guard.js';
import { CreateCategoryDto } from './category.dto.js';
import { CreateProductVariantDto } from './product-variant.dto.js';
import { CreateProductDto } from './product.dto.js';
import { ProductService } from './product.service.js';

@Controller('products')
@UseGuards(JwtAuthGuard, PermissionGuard)
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

  // GET /products/categories?page=1&limit=20&fields=id,name,slug
  @Get('categories')
  @RequirePermission('product.read')
  async listCategories(
    @OrganizationId() organizationId: number,
    @Query() pagination: PaginationQueryDto,
  ) {
    return this.productService.listCategories(
      organizationId,
      pagination,
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

  // GET /products?page=1&limit=20&fields=id,name,slug
  @Get()
  @RequirePermission('product.read')
  async listProducts(
    @OrganizationId() organizationId: number,
    @Query() pagination: PaginationQueryDto,
  ) {
    return this.productService.listProducts(
      organizationId,
      pagination,
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

  // GET /products/:productId/variants?page=1&limit=20&fields=id,sku,price
  @Get(':productId/variants')
  @RequirePermission('product.read')
  async listVariants(
    @OrganizationId() organizationId: number,

    @Param('productId', ParseIntPipe)
    productId: number,

    @Query() pagination: PaginationQueryDto,
  ) {
    return this.productService.listVariants(
      organizationId,
      productId,
      pagination,
    );
  }
}