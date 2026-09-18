import { Module } from '@nestjs/common';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { OtpModule } from './otp/otp.module.js';
import { RedisModule } from './redis/redis.module.js';

@Module({
  imports: [
    RedisModule,
    NotificationsModule,
    OtpModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}