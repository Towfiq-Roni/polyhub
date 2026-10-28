import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // ponytail: configureApp call not unit-tested (main.ts runs bootstrap on import) -> add a bootstrap smoke test if main.ts gains logic
  configureApp(app);

  app.enableCors({ origin: configService.getOrThrow<string>('WEB_ORIGIN'), credentials: true });

  const swaggerConfig = new DocumentBuilder().setTitle('Hub API').setVersion('1.0').build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);

  app.enableShutdownHooks();

  await app.listen(configService.getOrThrow<number>('PORT'));
}

bootstrap();
