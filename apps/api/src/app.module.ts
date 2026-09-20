import { Module } from '@nestjs/common';

import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller.js';

import { AppService } from './app.service.js';

import { ProductModule } from './product/product.module.js';

import { AuthModule } from './auth/auth.module.js';

import { NotificationsModule } from './notifications/notifications.module.js';

import { OrganizationModule } from './organization/organization.module.js';

import { OtpModule } from './otp/otp.module.js';

import { InventoryModule } from './inventory/inventory.module.js';
import { RedisModule } from './redis/redis.module.js';

@Module({

  imports: [

    ConfigModule.forRoot({

      isGlobal: true,

    }),

    RedisModule,

    NotificationsModule,

    OtpModule,
InventoryModule,
    AuthModule,

    OrganizationModule,
ProductModule,
  ],

  controllers: [AppController],

  providers: [AppService],

})

export class AppModule {}