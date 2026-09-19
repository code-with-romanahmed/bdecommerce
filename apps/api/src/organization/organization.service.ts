import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { db } from '../prisma/db.js';
import type { CreateOrganizationDto } from './organization.dto.js';

@Injectable()
export class OrganizationService {
  async create(
    dto: CreateOrganizationDto,
  ) {
    const existing =
      await db.orm.public.Organization
        .where({ slug: dto.slug })
        .first();

    if (existing) {
      throw new ConflictException(
        'Organization slug already exists',
      );
    }

    return db.orm.public.Organization.create({
      name: dto.name,
      slug: dto.slug,
    });
  }

  async getById(id: number) {
    const organization =
      await db.orm.public.Organization
        .where({ id })
        .first();

    if (!organization) {
      throw new NotFoundException(
        'Organization not found',
      );
    }

    return organization;
  }
}
