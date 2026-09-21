import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

// Minimal shape of what this filter needs from the response object — avoids a
// direct dependency on @types/express (a transitive, undeclared dep here;
// @nestjs/platform-express is the declared express integration).
interface MinimalResponse {
  status(code: number): { json(body: unknown): void };
}

/**
 * Global exception filter. Skeleton of ADR-0010's enriched envelope: today this
 * emits `{ error: { statusCode, message } }` only. ADR-0010's full shape
 * (`code`, `nextStep`, `fieldErrors`, requestId provenance, Prisma error
 * mapping) needs the `packages/shared` error-code catalog, which doesn't exist
 * yet (Phase 1 task) — deferred to whichever task builds that catalog, not
 * silently dropped.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<MinimalResponse>();

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const responseBody = exception.getResponse();
      const message =
        typeof responseBody === 'string'
          ? responseBody
          : ((responseBody as { message?: string }).message ?? exception.message);

      response.status(statusCode).json({ error: { statusCode, message } });
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.stack : exception,
    );

    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ error: { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' } });
  }
}
