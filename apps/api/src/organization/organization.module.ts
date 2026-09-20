import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';

import { OrganizationController } from './organization.controller.js';
import { OrganizationService } from './organization.service.js';

import { BranchController } from './branch.controller.js';
import { BranchService } from './branch.service.js';

@Module({
  imports: [AuthModule],

  controllers: [
    OrganizationController,
    BranchController,
  ],

  providers: [
    OrganizationService,
    BranchService,
  ],

  exports: [
    OrganizationService,
    BranchService,
  ],
})
export class OrganizationModule {}