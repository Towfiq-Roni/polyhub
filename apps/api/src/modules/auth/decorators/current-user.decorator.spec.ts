import { ExecutionContext } from '@nestjs/common';
import { getCurrentUserFromContext } from './current-user.decorator';

describe('getCurrentUserFromContext [F-27]', () => {
  function makeContext(request: unknown): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  it('returns req.user from the HTTP execution context', () => {
    const user = { id: 'user-1', email: 'ada@example.com', name: 'Ada Lovelace', status: 'ACTIVE' };
    const ctx = makeContext({ user });

    expect(getCurrentUserFromContext(ctx)).toBe(user);
  });

  it('returns undefined when the request has no user attached', () => {
    const ctx = makeContext({});

    expect(getCurrentUserFromContext(ctx)).toBeUndefined();
  });
});
