import { Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

function mockHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status };
  const request = { url: '/api/v1/whatever', method: 'GET' };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('HttpExceptionFilter', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps an HttpException to { error: { statusCode, message } } with its own status', () => {
    const filter = new HttpExceptionFilter();
    const { host, status, json } = mockHost();

    filter.catch(new NotFoundException('client not found'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      error: { statusCode: 404, message: 'client not found' },
    });
  });

  it('maps a non-HttpException error to a generic 500 without leaking internals', () => {
    const filter = new HttpExceptionFilter();
    const { host, status, json } = mockHost();

    filter.catch(new Error('secret stack trace detail'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { statusCode: 500, message: 'Internal server error' },
    });
  });

  it('logs unhandled (non-HttpException) errors via Nest Logger, not console.log', () => {
    const filter = new HttpExceptionFilter();
    const { host } = mockHost();
    const logSpy = jest.spyOn(Logger.prototype, 'error');

    filter.catch(new Error('boom'), host);

    expect(logSpy).toHaveBeenCalled();
  });

  it('preserves a 401 UnauthorizedException as-is (no factor-leak beyond its own message)', () => {
    const filter = new HttpExceptionFilter();
    const { host, status, json } = mockHost();

    filter.catch(new UnauthorizedException('Invalid credentials'), host);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      error: { statusCode: 401, message: 'Invalid credentials' },
    });
  });
});
