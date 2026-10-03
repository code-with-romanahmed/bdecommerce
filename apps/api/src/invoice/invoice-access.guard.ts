// invoice/invoice-access.guard.ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';

import { InvoiceAccessService } from './invoice-access.service.js';
import { InvoiceService } from './invoice.service.js';

@Injectable()
export class InvoiceAccessGuard implements CanActivate {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly invoiceAccess: InvoiceAccessService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const request =
      context
        .switchToHttp()
        .getRequest<AuthenticatedRequest>();

    const user = request.authUser;
    if (!user) {
      return false;
    }

    const invoiceId = Number(request.params?.invoiceId);

    // getInvoice নিজেই organizationId দিয়ে scoped, তাই cross-org
    // access এখানেই আটকায় (NotFoundException ছুঁড়বে)
    const { order } = await this.invoiceService.getInvoice(
      user.organizationId,
      invoiceId,
    );

    const allowed = await this.invoiceAccess.canAccessInvoice(
      user,
      order,
    );

    if (!allowed) {
      throw new ForbiddenException(
        'You do not have access to this invoice',
      );
    }

    return true;
  }
}
