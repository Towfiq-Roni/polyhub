import { of } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { TransformInterceptor } from './transform.interceptor';

function run(value: unknown): Promise<unknown> {
  const interceptor = new TransformInterceptor();
  const context = {} as ExecutionContext;
  const handler: CallHandler = { handle: () => of(value) };
  return new Promise((resolve) => {
    interceptor.intercept(context, handler).subscribe((result: unknown) => resolve(result));
  });
}

describe('TransformInterceptor', () => {
  it('wraps a plain object return value in { data }', async () => {
    const result = await run({ id: 1, email: 'a@b.com' });
    expect(result).toEqual({ data: { id: 1, email: 'a@b.com' } });
  });

  it('wraps an array return value in { data }', async () => {
    const result = await run([1, 2, 3]);
    expect(result).toEqual({ data: [1, 2, 3] });
  });

  it('does not double-wrap a value that already has a top-level data key', async () => {
    const alreadyWrapped = { data: { id: 1 }, meta: { total: 1 } };
    const result = await run(alreadyWrapped);
    expect(result).toEqual(alreadyWrapped);
  });

  it('wraps undefined (e.g. 204 responses) as { data: undefined }', async () => {
    const result = await run(undefined);
    expect(result).toEqual({ data: undefined });
  });
});
