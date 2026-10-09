import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { OtpModule } from '../otp/otp.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { AuthSessionService } from './auth-session.service.js';
import authConfig from './auth.config.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { OAuthService } from './oauth.service.js';

@Module({
  imports: [
    ConfigModule.forFeature(authConfig),
    OtpModule,
    RbacModule,
    // registerAsync: env পড়া হয় মডিউল তৈরির সময় (import-order-এর ওপর নির্ভর
    // করে না), আর TTL কনফিগ থেকে আসে। JWT_SECRET না থাকলে সার্ভার চালুই হবে না।
    JwtModule.registerAsync({
      imports: [ConfigModule.forFeature(authConfig)],
      inject: [authConfig.KEY],
      useFactory: (config: ConfigType<typeof authConfig>) => {
        if (!config.jwtSecret) {
          throw new Error('JWT_SECRET is not set');
        }

        return {
          secret: config.jwtSecret,
          signOptions: {
            expiresIn: config.accessTokenTtlSeconds,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthSessionService,
    JwtAuthGuard,
    OAuthService,
  ],
  exports: [
    AuthService,
    AuthSessionService,
    JwtAuthGuard,
  ],
})
export class AuthModule {}