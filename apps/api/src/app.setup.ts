import cookieParser from 'cookie-parser';
import { INestApplication, ValidationPipe, ValidationPipeOptions } from '@nestjs/common';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

// Trust the first hop (nginx, per analysis/deployment-plan.md's reverse-proxy
// topology) so Express's `req.ip` reflects the real client IP from
// `X-Forwarded-For` rather than nginx's own address — required for
// ThrottlerGuard's per-source login rate limit (auth.controller.ts) to
// actually be per-client instead of one shared bucket for every request
// reaching the app.
const TRUST_PROXY_HOPS = 1;

// whitelist strips unknown body props (mass-assignment guard); transform yields DTO instances.
export const VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = { whitelist: true, transform: true };

// Shared by main.ts and every e2e harness so they cannot drift.
export function configureApp(app: INestApplication): void {
  // `any`-typed adapter instance is deliberate: NestExpressApplication would force a generic argument in every harness.
  app.getHttpAdapter().getInstance().set('trust proxy', TRUST_PROXY_HOPS);

  app.use(cookieParser());

  app.useGlobalPipes(new ValidationPipe(VALIDATION_PIPE_OPTIONS));
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  app.setGlobalPrefix('api/v1');
}
