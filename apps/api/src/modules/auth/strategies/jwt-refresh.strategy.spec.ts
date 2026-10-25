import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtRefreshStrategy, refreshTokenExtractor } from './jwt-refresh.strategy';
import { PrismaService } from '../../../prisma/prisma.service';

describe('refreshTokenExtractor [F-27]', () => {
  it('reads the refresh_token cookie off the request', () => {
    const req = { cookies: { refresh_token: 'the-cookie-value' } } as any;

    expect(refreshTokenExtractor(req)).toBe('the-cookie-value');
  });

  it('returns null when there is no cookie jar at all', () => {
    const req = {} as any;

    expect(refreshTokenExtractor(req)).toBeNull();
  });

  it('returns null when the refresh_token cookie is absent', () => {
    const req = { cookies: {} } as any;

    expect(refreshTokenExtractor(req)).toBeNull();
  });
});

describe('JwtRefreshStrategy [F-27]', () => {
  const configService = {
    getOrThrow: jest.fn().mockReturnValue('test-refresh-secret'),
  } as unknown as ConfigService;

  const ACTIVE_USER = {
    id: 'user-1',
    email: 'ada@example.com',
    passwordHash: 'super-secret-hash',
    name: 'Ada Lovelace',
    status: 'ACTIVE',
  };

  function makeStrategy(
    user: unknown,
    session: unknown,
  ): { strategy: JwtRefreshStrategy; findUniqueSession: jest.Mock } {
    const findUniqueUser = jest.fn().mockResolvedValue(user);
    const findUniqueSession = jest.fn().mockResolvedValue(session);
    const prisma = {
      user: { findUnique: findUniqueUser },
      session: { findUnique: findUniqueSession },
    } as unknown as PrismaService;
    return { strategy: new JwtRefreshStrategy(configService, prisma), findUniqueSession };
  }

  it('returns a minimal user shape including sid for a found, active user with a live session', async () => {
    const session = {
      id: 'session-1',
      userId: 'user-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    const { strategy, findUniqueSession } = makeStrategy(ACTIVE_USER, session);

    const result = await strategy.validate({ sub: 'user-1', sid: 'session-1' });

    expect(result).toEqual({
      id: 'user-1',
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      status: 'ACTIVE',
      sid: 'session-1',
    });
    expect(result).not.toHaveProperty('passwordHash');
    expect(findUniqueSession).toHaveBeenCalledWith({ where: { id: 'session-1' } });
  });

  it('throws UnauthorizedException when the user does not exist', async () => {
    const { strategy } = makeStrategy(null, null);

    await expect(strategy.validate({ sub: 'ghost', sid: 'session-1' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws UnauthorizedException when the user is inactive', async () => {
    const { strategy } = makeStrategy({ ...ACTIVE_USER, status: 'INACTIVE' }, null);

    await expect(strategy.validate({ sub: 'user-1', sid: 'session-1' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws UnauthorizedException when the session does not exist (DEC-078)', async () => {
    const { strategy } = makeStrategy(ACTIVE_USER, null);

    await expect(strategy.validate({ sub: 'user-1', sid: 'ghost-session' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when the session is revoked (DEC-078, Gate E10)', async () => {
    const session = {
      id: 'session-1',
      userId: 'user-1',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    };
    const { strategy } = makeStrategy(ACTIVE_USER, session);

    await expect(strategy.validate({ sub: 'user-1', sid: 'session-1' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws UnauthorizedException when the session has expired', async () => {
    const session = {
      id: 'session-1',
      userId: 'user-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    };
    const { strategy } = makeStrategy(ACTIVE_USER, session);

    await expect(strategy.validate({ sub: 'user-1', sid: 'session-1' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws UnauthorizedException when the session belongs to a different user (defense-in-depth)', async () => {
    const session = {
      id: 'session-1',
      userId: 'someone-else',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    const { strategy } = makeStrategy(ACTIVE_USER, session);

    await expect(strategy.validate({ sub: 'user-1', sid: 'session-1' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
