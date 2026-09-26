import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { OrderAccessGuard } from './order-access.guard.js';
import { OrderAccessService } from './order-access.service.js';
import { OrderController } from './order.controller.js';
import { OrderService } from './order.service.js';

@Module({
  imports: [AuthModule],
  controllers: [OrderController],
  providers: [OrderService, OrderAccessService, OrderAccessGuard],
})
export class OrderModule {}