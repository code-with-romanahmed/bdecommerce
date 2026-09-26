import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { CartModule } from './cart/cart.module.js';
import { CashierAssignmentModule } from './cashier/cashier-assignment-module.js';
import { CourierCheckModule } from './courier-check/courier-check.module.js';
import { CustomerModule } from './customer/customer.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { InvoiceModule } from './invoice/invoice.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { OrderModule } from './order/order.module.js';
import { OrganizationModule } from './organization/organization.module.js';
import { OtpModule } from './otp/otp.module.js';
import { ProductModule } from './product/product.module.js';
import { RedisModule } from './redis/redis.module.js';
import { RiskModule } from './risk/risk.module.js';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

     RiskModule, 
    InvoiceModule, 
    RedisModule,
    NotificationsModule,
    OtpModule,
    AuthModule,
    OrganizationModule,
    CustomerModule,
    ProductModule,
    InventoryModule,
    CartModule,
     CourierCheckModule, 
    OrderModule,
    CashierAssignmentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}