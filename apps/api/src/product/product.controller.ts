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

import { CreateCategoryDto } from './category.dto.js';
import { CreateProductVariantDto } from './product-variant.dto.js';
import { CreateProductDto } from './product.dto.js';
import { ProductService } from './product.service.js';

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductController {
  constructor(
    private readonly productService: ProductService,
  ) {}

  @Post('categories')
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
  async listCategories(
    @OrganizationId() organizationId: number,
  ) {
    return this.productService.listCategories(
      organizationId,
    );
  }

  @Post()
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
  async listProducts(
    @OrganizationId() organizationId: number,
  ) {
    return this.productService.listProducts(
      organizationId,
    );
  }

  @Post(':productId/variants')
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