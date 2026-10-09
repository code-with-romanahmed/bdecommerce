import {
  Body,
  Controller,
  ForbiddenException,
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

import { CreateBranchDto } from './branch.dto.js';
import { BranchService } from './branch.service.js';

@Controller('organizations/:organizationId/branches')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class BranchController {
  constructor(
    private readonly branchService: BranchService,
  ) {}

  /**
   * URL-এর organizationId অবশ্যই লগইন করা ইউজারের organization-এর
   * সমান হতে হবে। না মিললে 403।
   */
  private assertSameOrganization(
    organizationIdFromUrl: number,
    organizationId: number,
  ): void {
    if (organizationIdFromUrl !== organizationId) {
      throw new ForbiddenException(
        'You cannot access another organization',
      );
    }
  }

  @Post()
  @RequirePermission('branch.create')
  async create(
    @Param('organizationId', ParseIntPipe)
    organizationIdFromUrl: number,

    @OrganizationId()
    organizationId: number,

    @Body()
    dto: CreateBranchDto,
  ) {
    this.assertSameOrganization(
      organizationIdFromUrl,
      organizationId,
    );

    return this.branchService.create(
      organizationId,
      dto,
    );
  }

  @Get()
  @RequirePermission('branch.read')
  async list(
    @Param('organizationId', ParseIntPipe)
    organizationIdFromUrl: number,

    @OrganizationId()
    organizationId: number,
  ) {
    this.assertSameOrganization(
      organizationIdFromUrl,
      organizationId,
    );

    return this.branchService.list(
      organizationId,
    );
  }

  @Get(':id')
  @RequirePermission('branch.read')
  async getById(
    @Param('organizationId', ParseIntPipe)
    organizationIdFromUrl: number,

    @Param('id', ParseIntPipe)
    branchId: number,

    @OrganizationId()
    organizationId: number,
  ) {
    this.assertSameOrganization(
      organizationIdFromUrl,
      organizationId,
    );

    return this.branchService.getById(
      organizationId,
      branchId,
    );
  }
}