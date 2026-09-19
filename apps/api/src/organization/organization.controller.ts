import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
} from '@nestjs/common';

import { OrganizationService } from './organization.service.js';

@Controller('organizations')
export class OrganizationController {
  constructor(
    private readonly organizationService: OrganizationService,
  ) {}

  @Get(':id')
  async getById(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.organizationService.getById(id);
  }
}
