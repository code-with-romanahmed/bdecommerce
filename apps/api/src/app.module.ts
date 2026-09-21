import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { CartModule } from './cart/cart.module.js';
import { CustomerModule } from './customer/customer.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { OrderModule } from './order/order.module.js';
import { PaymentModule } from './payment/payment.module.js';
import { OrganizationModule } from './organization/organization.module.js';
import { OtpModule } from './otp/otp.module.js';
import { ProductModule } from './product/product.module.js';
import { RedisModule } from './redis/redis.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    RedisModule,
    NotificationsModule,
    OtpModule,
    AuthModule,
    OrganizationModule,
    CustomerModule,
    ProductModule,
    InventoryModule,
    CartModule,
    OrderModule,
    PaymentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}