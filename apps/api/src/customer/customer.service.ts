import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { db } from '../prisma/db.js';

import type {
  CreateCustomerAddressDto,
  CreateCustomerDto,
} from './customer.dto.js';

@Injectable()
export class CustomerService {
  async createCustomer(
    organizationId: number,
    dto: CreateCustomerDto,
  ) {
    const existing =
      await db.orm.public.Customer
        .where({
          organizationId,
          phone: dto.phone,
        })
        .first();

    if (existing) {
      throw new ConflictException(
        'Customer phone already exists',
      );
    }

    return db.orm.public.Customer.create({
      organizationId,
      name: dto.name,
      phone: dto.phone,
      email: dto.email,
    });
  }

  async listCustomers(
    organizationId: number,
  ) {
    return db.orm.public.Customer
      .where({
        organizationId,
      })
      .all();
  }

  async getCustomer(
    organizationId: number,
    customerId: number,
  ) {
    const customer =
      await db.orm.public.Customer
        .where({
          id: customerId,
          organizationId,
        })
        .first();

    if (!customer) {
      throw new NotFoundException(
        'Customer not found',
      );
    }

    return customer;
  }

  async addAddress(
    organizationId: number,
    customerId: number,
    dto: CreateCustomerAddressDto,
  ) {
    await this.getCustomer(
      organizationId,
      customerId,
    );

    return db.orm.public.CustomerAddress.create({
      customerId,
      label: dto.label,
      recipientName: dto.recipientName,
      phone: dto.phone,
      addressLine1: dto.addressLine1,
      addressLine2: dto.addressLine2,
      city: dto.city,
      district: dto.district,
      postalCode: dto.postalCode,
    });
  }

  async listAddresses(
    organizationId: number,
    customerId: number,
  ) {
    await this.getCustomer(
      organizationId,
      customerId,
    );

    return db.orm.public.CustomerAddress
      .where({
        customerId,
      })
      .all();
  }
}