import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

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