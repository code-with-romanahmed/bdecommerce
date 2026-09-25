import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { RbacModule } from '../rbac/rbac.module.js';

import { CashierAssignmentController } from './cashier-assignment.controller.js';
import { CashierAssignmentService } from './cashier-assignment.service.js';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [CashierAssignmentController],
  providers: [CashierAssignmentService],
  exports: [CashierAssignmentService],
})
export class CashierAssignmentModule {}