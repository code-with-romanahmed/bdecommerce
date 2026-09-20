import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { db } from '../prisma/db.js';
import type { CreateBranchDto } from './branch.dto.js';

@Injectable()
export class BranchService {
  async create(
    organizationId: number,
    dto: CreateBranchDto,
  ) {
    const organization =
      await db.orm.public.Organization
        .where({ id: organizationId })
        .first();

    if (!organization) {
      throw new NotFoundException(
        'Organization not found',
      );
    }

    const existingBranches =
      await db.orm.public.Branch
        .where({ organizationId })
        .all();

    const nextNumber =
      existingBranches.length + 1;

    const code =
      `BR-${String(nextNumber).padStart(3, '0')}`;

    const existingCode =
      await db.orm.public.Branch
        .where({
          organizationId,
          code,
        })
        .first();

    if (existingCode) {
      throw new ConflictException(
        'Branch code already exists',
      );
    }

    return db.orm.public.Branch.create({
      organizationId,
      name: dto.name,
      code,
      type: dto.type,
    });
  }

  async list(
    organizationId: number,
  ) {
    return db.orm.public.Branch
      .where({ organizationId })
      .all();
  }

  async getById(
    organizationId: number,
    branchId: number,
  ) {
    const branch =
      await db.orm.public.Branch
        .where({
          id: branchId,
          organizationId,
        })
        .first();

    if (!branch) {
      throw new NotFoundException(
        'Branch not found',
      );
    }

    return branch;
  }
}