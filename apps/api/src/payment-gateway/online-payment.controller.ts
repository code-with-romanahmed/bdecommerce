import { createHash, timingSafeEqual } from 'node:crypto';

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Logger,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { Response } from 'express';

import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrderAccessGuard } from '../order/order-access.guard.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard.js';
import { RequirePermission } from '../rbac/permission.decorator.js';
import { PermissionGuard } from '../rbac/permission.guard.js';
import { InitiateOnlinePaymentDto } from './online-payment.dto.js';
import { OnlinePaymentService } from './online-payment.service.js';
import paymentGatewayConfig from './payment-gateway.config.js';
import { ONLINE_PROVIDERS, type OnlineProvider } from './payment-gateway.types.js';

function parseProvider(raw: string): OnlineProvider {
  const provider = raw.toUpperCase() as OnlineProvider;

  if (!ONLINE_PROVIDERS.includes(provider)) {
    throw new NotFoundException();
  }

  return provider;
}

const digest = (value: string) => createHash('sha256').update(value).digest();

@Controller('payments')
export class OnlinePaymentController {
  private readonly logger = new Logger(OnlinePaymentController.name);

  constructor(
    private readonly onlinePayments: OnlinePaymentService,
    @Inject(paymentGatewayConfig.KEY)
    private readonly config: ConfigType<typeof paymentGatewayConfig>,
  ) {}

  // -------------------------------------------------------------------
  // গ্রাহক (নিজের order) বা staff (access থাকা order) অনলাইন পেমেন্ট শুরু
  // করে। OrderAccessGuard নিশ্চিত করে order-টা এই ইউজারের।
  // -------------------------------------------------------------------
  @Post('orders/:id/online')
  @UseGuards(JwtAuthGuard, PermissionGuard, OrderAccessGuard, RateLimitGuard)
  @RequirePermission('payment.create')
  @RateLimit({
    name: 'online-pay-initiate',
    by: 'user',
    limit: 10,
    windowSeconds: 600,
  })
  initiate(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) orderId: number,
    @Body() dto: InitiateOnlinePaymentDto,
  ) {
    return this.onlinePayments.initiate(
      request.authUser!,
      orderId,
      dto.provider,
      dto.amount,
    );
  }

  // -------------------------------------------------------------------
  // টাকা এসেছে কিন্তু রেকর্ড হয়নি / অমিল পেমেন্টের তালিকা — শুধু
  // payment.override-ধারী (ADMIN) দেখতে পারবে, নিজের organization-এর।
  // -------------------------------------------------------------------
  @Get('review')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('payment.override')
  listNeedingReview(@Req() request: AuthenticatedRequest) {
    return this.onlinePayments.listNeedingReview(
      request.authUser!.organizationId,
    );
  }

  // -------------------------------------------------------------------
  // পাবলিক: gateway গ্রাহকের ব্রাউজারকে এখানে ফেরত পাঠায় (GET)।
  // কোনো JWT নেই, তাই query-র কিছুই বিশ্বাস করা হয় না; সার্ভার নিজে
  // gateway-র কাছে যাচাই করে। সবসময় ফ্রন্টএন্ডে redirect (কনফিগ-করা URL)।
  // -------------------------------------------------------------------
  @Get('callback/:provider')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    name: 'payment-callback',
    by: 'ip',
    limit: 60,
    windowSeconds: 600,
  })
  async callback(
    @Param('provider') rawProvider: string,
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ): Promise<void> {
    const provider = parseProvider(rawProvider);

    let target: string;

    try {
      target = await this.onlinePayments.handleCallback(provider, query);
    } catch (error) {
      this.logger.error(
        `Callback handling failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      target = `${this.config.frontendUrl}/payment-result?status=error`;
    }

    response.redirect(302, target);
  }

  // -------------------------------------------------------------------
  // পাবলিক server-to-server notification (IPN/webhook)। বডি শুধু "ট্রিগার";
  // আসল অবস্থা সবসময় gateway-র API থেকে যাচাই হয়। PAYMENT_WEBHOOK_SECRET
  // সেট থাকলে x-webhook-secret header-ও লাগবে।
  // -------------------------------------------------------------------
  @Post('webhook/:provider')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit({
    name: 'payment-webhook',
    by: 'ip',
    limit: 120,
    windowSeconds: 600,
  })
  async webhook(
    @Param('provider') rawProvider: string,
    @Headers('x-webhook-secret') secret: string | undefined,
    @Body() payload: unknown,
  ) {
    const provider = parseProvider(rawProvider);

    this.assertWebhookSecret(secret);

    await this.onlinePayments.handleWebhook(provider, payload);

    return { received: true };
  }

  private assertWebhookSecret(provided: string | undefined): void {
    const expected = this.config.webhookSecret;

    if (!expected) return;

    if (!provided || !timingSafeEqual(digest(provided), digest(expected))) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
  }
}