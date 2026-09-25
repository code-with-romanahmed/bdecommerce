import {
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationId } from '../auth/organization-context.decorator.js';
import { RequirePermission } from '../rbac/permission.decorator.js';
import { PermissionGuard } from '../rbac/permission.guard.js';

import { Req } from '@nestjs/common';

import { StartCashierAssignmentDto } from './cashier-assignment.dto.js';
import { CashierAssignmentService } from './cashier-assignment.service.js';

@Controller('cashier-assignments')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class CashierAssignmentController {
  constructor(
    private readonly cashierAssignmentService: CashierAssignmentService,
  ) {}

  @Post('start')
  @RequirePermission('customer.update')
  async start(
    @OrganizationId() organizationId: number,
    @Req() request: AuthenticatedRequest,
    @Body() dto: StartCashierAssignmentDto,
  ) {
    // cashierId ইচ্ছাকৃতভাবে dto থেকে না নিয়ে req.authUser থেকে নেওয়া
    // হচ্ছে — নাহলে যেকোনো cashier অন্য cashier-এর নামে assignment
    // তৈরি করে দিতে পারত।
    const cashierId = request.authUser!.id;

    return this.cashierAssignmentService.startAssignment(
      organizationId,
      cashierId,
      dto.customerId,
    );
  }

  @Post('end')
  @RequirePermission('customer.update')
  async end(
    @OrganizationId() organizationId: number,
    @Req() request: AuthenticatedRequest,
  ) {
    const cashierId = request.authUser!.id;

    const endedCount =
      await this.cashierAssignmentService.endActiveAssignments(
        organizationId,
        cashierId,
      );

    return { endedCount };
  }
}
