import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module.js';
import { OrderModule } from '../order/order.module.js';
import { BkashGateway } from './bkash.gateway.js';
import { NagadGateway } from './nagad.gateway.js';
import { OnlinePaymentController } from './online-payment.controller.js';
import { OnlinePaymentService } from './online-payment.service.js';
import paymentGatewayConfig from './payment-gateway.config.js';
import { PaymentIntentStore } from './payment-intent.store.js';
import { PaymentReconciliationService } from './payment-reconciliation.service.js';

@Module({
  imports: [
    ConfigModule.forFeature(paymentGatewayConfig),
    AuthModule,
    OrderModule,
  ],
  controllers: [OnlinePaymentController],
  providers: [
    BkashGateway,
    NagadGateway,
    PaymentIntentStore,
    OnlinePaymentService,
    PaymentReconciliationService,
  ],
})
export class PaymentGatewayModule {}