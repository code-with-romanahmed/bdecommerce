import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';

import { CartAccessGuard } from './cart-access.guard.js';
import { CartAccessService } from './cart-access.service.js';
import { CartController } from './cart.controller.js';
import { CartService } from './cart.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CartController],
  providers: [CartService, CartAccessService, CartAccessGuard],
  exports: [CartService],
})
export class CartModule {}