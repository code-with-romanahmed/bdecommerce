import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';

import { ProductController } from './product.controller.js';
import { ProductService } from './product.service.js';

@Module({
  imports: [AuthModule],

  controllers: [
    ProductController,
  ],

  providers: [
    ProductService,
  ],

  exports: [
    ProductService,
  ],
})
export class ProductModule {}