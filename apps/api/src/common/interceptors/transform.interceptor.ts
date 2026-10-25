import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

function isAlreadyWrapped(value: unknown): value is { data: unknown } {
  return typeof value === 'object' && value !== null && 'data' in value;
}

/**
 * Wraps every controller return value as `{ data: <value> }` per hub-codebase's
 * response envelope convention, unless the value is already shaped that way.
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((value: unknown) => (isAlreadyWrapped(value) ? value : { data: value })));
  }
}
