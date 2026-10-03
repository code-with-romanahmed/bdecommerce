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
import { RequirePermission } from '../rbac/permission.decorator.js';
import { PermissionGuard } from '../rbac/permission.guard.js';

import {
  CreateCustomerAddressDto,
  CreateCustomerDto,
} from './customer.dto.js';

import { CustomerService } from './customer.service.js';

@Controller('customers')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class CustomerController {
  constructor(
    private readonly customerService: CustomerService,
  ) {}

  @Post()
  @RequirePermission('customer.update')
  async createCustomer(
    @OrganizationId() organizationId: number,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customerService.createCustomer(
      organizationId,
      dto,
    );
  }

  @Get()
  @RequirePermission('customer.read')
  async listCustomers(
    @OrganizationId() organizationId: number,
  ) {
    return this.customerService.listCustomers(
      organizationId,
    );
  }

  @Get(':customerId')
  @RequirePermission('customer.read')
  async getCustomer(
    @OrganizationId() organizationId: number,
    @Param('customerId', ParseIntPipe)
    customerId: number,
  ) {
    return this.customerService.getCustomer(
      organizationId,
      customerId,
    );
  }

  @Post(':customerId/addresses')
  @RequirePermission('customer.update')
  async addAddress(
    @OrganizationId() organizationId: number,
    @Param('customerId', ParseIntPipe)
    customerId: number,
    @Body() dto: CreateCustomerAddressDto,
  ) {
    return this.customerService.addAddress(
      organizationId,
      customerId,
      dto,
    );
  }

  @Get(':customerId/addresses')
  @RequirePermission('customer.read')
  async listAddresses(
    @OrganizationId() organizationId: number,
    @Param('customerId', ParseIntPipe)
    customerId: number,
  ) {
    return this.customerService.listAddresses(
      organizationId,
      customerId,
    );
  }
}