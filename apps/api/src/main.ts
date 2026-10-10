import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Response } from 'express';
import helmet from 'helmet';

import { AppModule } from './app.module.js';
import {
  buildCorsOptions,
  buildFrameAncestorsHeader,
  buildHelmetOptions,
  resolveCorsPolicy,
} from './security/security.config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Reverse proxy-র পেছনে চললে (nginx, load balancer ইত্যাদি) আসল client IP
  // পেতে TRUST_PROXY=<proxy hop সংখ্যা> সেট করুন, যেমন 1। না সেট করলে
  // রিকোয়েস্টের সরাসরি সংযোগের IP ব্যবহার হয়। (IP-ভিত্তিক rate limit
  // ঠিকভাবে কাজ করতে এটা জরুরি।)
  const trustProxy = process.env.TRUST_PROXY;

  if (trustProxy) {
    app
      .getHttpAdapter()
      .getInstance()
      .set(
        'trust proxy',
        /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
      );
  }

  // ---- নিরাপত্তা header (helmet) ও CORS ----
  // CORS_ORIGINS=http://localhost:3000,https://shop.example.com  (কমা দিয়ে)
  // না দিলে: production-এ কোনো cross-origin নয়; ডেভেলপমেন্টে সব origin খোলা।
  const logger = new Logger('Bootstrap');
  const corsPolicy = resolveCorsPolicy(
    process.env.CORS_ORIGINS,
    process.env.NODE_ENV,
  );

  app.use(helmet(buildHelmetOptions()));

  // helmet-এর CSP বন্ধ; শুধু frame-ancestors নিজেরা বসাই (কারণ security.config.ts-এ)
  const frameAncestors = buildFrameAncestorsHeader(corsPolicy);

  app.use((_req: unknown, res: Response, next: NextFunction) => {
    res.setHeader('Content-Security-Policy', frameAncestors);
    next();
  });

  const corsOptions = buildCorsOptions(corsPolicy);

  if (corsOptions) {
    app.enableCors(corsOptions);
  }

  if (corsPolicy.kind === 'deny') {
    logger.warn(
      'CORS_ORIGINS সেট নেই — ব্রাউজার থেকে cross-origin রিকোয়েস্ট বন্ধ',
    );
  } else if (corsPolicy.kind === 'allow-all') {
    logger.warn(
      process.env.NODE_ENV === 'production'
        ? 'CORS: সব origin খোলা (production-এ CORS_ORIGINS দিয়ে সীমিত করুন)'
        : 'CORS: সব origin খোলা (ডেভেলপমেন্ট)',
    );
  } else {
    logger.log(`CORS: অনুমোদিত origin = ${corsPolicy.origins.join(', ')}`);
  }

  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 4000);
}

await bootstrap();