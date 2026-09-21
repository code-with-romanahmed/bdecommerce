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

import {
  CreateCustomerAddressDto,
  CreateCustomerDto,
} from './customer.dto.js';

import { CustomerService } from './customer.service.js';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomerController {
  constructor(
    private readonly customerService: CustomerService,
  ) {}

  @Post()
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
  async listCustomers(
    @OrganizationId() organizationId: number,
  ) {
    return this.customerService.listCustomers(
      organizationId,
    );
  }

  @Get(':customerId')
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