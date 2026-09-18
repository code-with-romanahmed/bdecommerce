import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthSessionService } from './auth-session.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import authConfig from './auth.config.js';
import { OtpModule } from '../otp/otp.module.js';

@Module({
  imports: [
    ConfigModule.forFeature(authConfig),
    OtpModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: {
        expiresIn: '15m',
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthSessionService,
    JwtAuthGuard,
  ],
  exports: [
    AuthService,
    AuthSessionService,
    JwtAuthGuard,
  ],
})
export class AuthModule {}
