import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';

import { OrganizationId } from '../auth/organization-context.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { OrganizationService } from './organization.service.js';

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationController {
  constructor(
    private readonly organizationService: OrganizationService,
  ) {}

  @Get(':id')
  async getById(
    @Param('id', ParseIntPipe) id: number,
    @OrganizationId() organizationId: number,
    @Req() request: AuthenticatedRequest,
  ) {
    const organization =
      await this.organizationService.getById(
        id,
        organizationId,
      );

    return {
      organization,
      userId: request.authUser?.id,
      organizationId,
    };
  }
}
