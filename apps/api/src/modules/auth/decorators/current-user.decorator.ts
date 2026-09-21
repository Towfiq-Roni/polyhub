import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Exported separately from the decorator factory so it can be unit-tested
 * directly against a mocked ExecutionContext (createParamDecorator's return
 * value cannot be invoked outside a real Nest request pipeline).
 */
export function getCurrentUserFromContext(ctx: ExecutionContext): unknown {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
}

/**
 * Pulls the authenticated user off the request — the shape a passport
 * strategy's `validate()` return value is attached as (Nest/Passport
 * convention), populated by JwtAccessGuard/JwtRefreshGuard upstream.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => getCurrentUserFromContext(ctx),
);
