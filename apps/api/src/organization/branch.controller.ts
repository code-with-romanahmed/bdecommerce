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

import { CreateBranchDto } from './branch.dto.js';
import { BranchService } from './branch.service.js';

@Controller('organizations/:organizationId/branches')
@UseGuards(JwtAuthGuard)
export class BranchController {
  constructor(
    private readonly branchService: BranchService,
  ) {}

  @Post()
  async create(
    @Param('organizationId', ParseIntPipe)
    organizationIdFromUrl: number,

    @OrganizationId()
    organizationId: number,

    @Body()
    dto: CreateBranchDto,
  ) {
    if (
      organizationIdFromUrl !== organizationId
    ) {
      return this.branchService.getById(
        organizationId,
        -1,
      );
    }

    return this.branchService.create(
      organizationId,
      dto,
    );
  }

  @Get()
  async list(
    @Param('organizationId', ParseIntPipe)
    organizationIdFromUrl: number,

    @OrganizationId()
    organizationId: number,
  ) {
    if (
      organizationIdFromUrl !== organizationId
    ) {
      return this.branchService.getById(
        organizationId,
        -1,
      );
    }

    return this.branchService.list(
      organizationId,
    );
  }

  @Get(':id')
  async getById(
    @Param('organizationId', ParseIntPipe)
    organizationIdFromUrl: number,

    @Param('id', ParseIntPipe)
    branchId: number,

    @OrganizationId()
    organizationId: number,
  ) {
    if (
      organizationIdFromUrl !== organizationId
    ) {
      return this.branchService.getById(
        organizationId,
        -1,
      );
    }

    return this.branchService.getById(
      organizationId,
      branchId,
    );
  }
}