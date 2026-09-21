import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Trust the first hop (nginx, per analysis/deployment-plan.md's reverse-proxy
  // topology) so Express's `req.ip` reflects the real client IP from
  // `X-Forwarded-For` rather than nginx's own address — required for
  // ThrottlerGuard's per-source login rate limit (auth.controller.ts) to
  // actually be per-client instead of one shared bucket for every request
  // reaching the app.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(cookieParser());

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  app.enableCors({ origin: configService.getOrThrow<string>('WEB_ORIGIN'), credentials: true });

  app.setGlobalPrefix('api/v1');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Hub API')
    .setVersion('1.0')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);

  app.enableShutdownHooks();

  await app.listen(configService.getOrThrow<number>('PORT'));
}

bootstrap();
