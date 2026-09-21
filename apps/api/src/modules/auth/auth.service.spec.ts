import * as argon2 from 'argon2';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService, buildRefreshCookieOptions, REFRESH_COOKIE_NAME } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';

const CONFIG_VALUES: Record<string, unknown> = {
  JWT_ACCESS_SECRET: 'access-secret',
  JWT_ACCESS_TTL: '1d',
  JWT_REFRESH_SECRET: 'refresh-secret',
  JWT_REFRESH_TTL: '7d',
  LOCKOUT_MAX_ATTEMPTS: 10,
  LOCKOUT_WINDOW_MINUTES: 15,
};

const SESSION_EXP_SECONDS = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

describe('AuthService', () => {
  let correctPasswordHash: string;
  const CORRECT_PASSWORD = 'correct horse battery staple';

  beforeAll(async () => {
    correctPasswordHash = await argon2.hash(CORRECT_PASSWORD, { type: argon2.argon2id });
  });

  function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'user-1',
      email: 'ada@example.com',
      passwordHash: correctPasswordHash,
      name: 'Ada Lovelace',
      status: 'ACTIVE',
      failedLoginAttempts: 0,
      firstFailedAttemptAt: null,
      lockoutUntil: null,
      lastLoginAt: null,
      userRoles: [{ role: { name: 'SUPER_ADMIN' } }],
      ...overrides,
    };
  }

  function makeService(user: unknown, session: unknown = null) {
    const findUnique = jest.fn().mockResolvedValue(user);
    const update = jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...(user as object), ...data }));
    const executeRaw = jest.fn().mockResolvedValue(1);
    const sessionCreate = jest.fn().mockResolvedValue(session);
    const sessionUpdate = jest.fn().mockResolvedValue(session);
    const sessionFindUnique = jest.fn().mockResolvedValue(session);
    const prisma = {
      user: { findUnique, update },
      session: { create: sessionCreate, update: sessionUpdate, findUnique: sessionFindUnique },
      $executeRaw: executeRaw,
    } as unknown as PrismaService;

    // Real signAsync/decode-shaped fakes: encodes secret/expiresIn/sub/sid into the
    // "token" string, and `decode` parses that same string back out — so the
    // service's own expiresAt-from-decoded-exp logic is exercised for real rather
    // than re-implemented in the mock.
    const signAsync = jest
      .fn()
      .mockImplementation((payload: { sub: string; sid?: string }, options: { secret: string; expiresIn: string }) =>
        Promise.resolve(`signed:${options.secret}:${options.expiresIn}:${payload.sub}:${payload.sid ?? ''}`),
      );
    const decode = jest.fn().mockImplementation((token: string) => {
      const isRefresh = token.startsWith('signed:refresh-secret:');
      return { exp: isRefresh ? SESSION_EXP_SECONDS : 0 };
    });
    const jwtService = { signAsync, decode } as unknown as JwtService;

    const configService = {
      getOrThrow: jest.fn((key: string) => CONFIG_VALUES[key]),
    } as unknown as ConfigService;

    const service = new AuthService(prisma, jwtService, configService);
    return { service, findUnique, update, executeRaw, signAsync, decode, sessionCreate, sessionUpdate, sessionFindUnique };
  }

  describe('login', () => {
    it('resets lockout fields, sets lastLoginAt, and returns access+refresh tokens on success', async () => {
      const user = makeUser({ failedLoginAttempts: 3, firstFailedAttemptAt: new Date() });
      const { service, update } = makeService(user);

      const result = await service.login('ada@example.com', CORRECT_PASSWORD);

      expect(update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          failedLoginAttempts: 0,
          firstFailedAttemptAt: null,
          lockoutUntil: null,
          lastLoginAt: expect.any(Date),
        },
      });
      expect(result.accessToken).toBe('signed:access-secret:1d:user-1:');
      expect(result.refreshToken).toMatch(/^signed:refresh-secret:7d:user-1:/);
      expect(result.user).toEqual({
        id: 'user-1',
        email: 'ada@example.com',
        name: 'Ada Lovelace',
        status: 'ACTIVE',
        roles: ['SUPER_ADMIN'],
      });
    });

    it('creates exactly one Session row per login, id embedded as the refresh token sid claim (DEC-078)', async () => {
      const user = makeUser();
      const { service, sessionCreate } = makeService(user);

      const result = await service.login('ada@example.com', CORRECT_PASSWORD);

      expect(sessionCreate).toHaveBeenCalledTimes(1);
      const createCall = sessionCreate.mock.calls[0][0];
      expect(createCall.data.userId).toBe('user-1');
      expect(createCall.data.expiresAt).toEqual(new Date(SESSION_EXP_SECONDS * 1000));

      const embeddedSid = result.refreshToken.split(':').pop();
      expect(embeddedSid).toBe(createCall.data.id);
      expect(embeddedSid).toBeTruthy();
    });

    it('rejects an unknown email with a generic message', async () => {
      const { service, update, sessionCreate } = makeService(null);

      await expect(service.login('ghost@example.com', 'whatever')).rejects.toThrow(UnauthorizedException);
      expect(update).not.toHaveBeenCalled();
      expect(sessionCreate).not.toHaveBeenCalled();
    });

    // The lockout window state machine (reset-if-expired vs increment,
    // trip-at-max) used to live in application code and was unit-tested here
    // via mocked prisma.user.update() call args. It now lives entirely inside
    // one atomic SQL UPDATE (see recordFailedAttempt's CASE expressions) so
    // that concurrent failed logins on the same account can't lose updates to
    // each other (see auth.e2e-spec.ts's "serializes concurrent failed
    // logins" regression test, and E4/E5 which drive the same SQL through a
    // real Postgres and prove the increment/reset/lockout-trip arithmetic is
    // correct end to end). Mocking $executeRaw's SQL string here would only
    // prove this test's own expectations, not the query's real behavior —
    // real behavior is what the e2e tests check. This unit level only proves
    // AuthService delegates to that one atomic statement, and nowhere does a
    // read-then-write update of the counter.
    it('records a wrong-password attempt via exactly one atomic $executeRaw call, never a read-then-write user.update (race-safety)', async () => {
      const user = makeUser({ failedLoginAttempts: 2, firstFailedAttemptAt: new Date() });
      const { service, update, executeRaw, sessionCreate } = makeService(user);

      await expect(service.login('ada@example.com', 'wrong-password')).rejects.toThrow(UnauthorizedException);

      expect(executeRaw).toHaveBeenCalledTimes(1);
      expect(update).not.toHaveBeenCalled();
      expect(sessionCreate).not.toHaveBeenCalled();
    });

    it('rejects a locked account even with the correct password, without touching the lockout counter at all', async () => {
      const user = makeUser({
        failedLoginAttempts: 10,
        lockoutUntil: new Date(Date.now() + 5 * 60_000), // still locked
      });
      const { service, update, executeRaw } = makeService(user);

      await expect(service.login('ada@example.com', CORRECT_PASSWORD)).rejects.toThrow(UnauthorizedException);
      expect(update).not.toHaveBeenCalled();
      expect(executeRaw).not.toHaveBeenCalled();
    });

    it('allows login again once lockoutUntil has passed', async () => {
      const user = makeUser({
        failedLoginAttempts: 10,
        lockoutUntil: new Date(Date.now() - 1000), // lockout expired 1s ago
      });
      const { service, update } = makeService(user);

      const result = await service.login('ada@example.com', CORRECT_PASSWORD);

      expect(result.accessToken).toBeDefined();
      expect(update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          failedLoginAttempts: 0,
          firstFailedAttemptAt: null,
          lockoutUntil: null,
          lastLoginAt: expect.any(Date),
        },
      });
    });
  });

  describe('refresh', () => {
    const LIVE_SESSION = {
      id: 'session-1',
      userId: 'user-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };

    it('issues a new access+refresh token pair for an active user with a live session, extending expiresAt (DEC-078)', async () => {
      const user = makeUser();
      const { service, findUnique, sessionFindUnique, sessionUpdate } = makeService(user, LIVE_SESSION);

      const result = await service.refresh('user-1', 'session-1');

      expect(findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' } });
      expect(sessionFindUnique).toHaveBeenCalledWith({ where: { id: 'session-1' } });
      expect(result.accessToken).toBe('signed:access-secret:1d:user-1:');
      expect(result.refreshToken).toBe('signed:refresh-secret:7d:user-1:session-1');
      expect(sessionUpdate).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { expiresAt: new Date(SESSION_EXP_SECONDS * 1000) },
      });
    });

    it('rejects when the user is no longer active', async () => {
      const user = makeUser({ status: 'INACTIVE' });
      const { service } = makeService(user, LIVE_SESSION);

      await expect(service.refresh('user-1', 'session-1')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when the session does not exist', async () => {
      const user = makeUser();
      const { service } = makeService(user, null);

      await expect(service.refresh('user-1', 'ghost-session')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when the session has been revoked (Gate E10)', async () => {
      const user = makeUser();
      const revoked = { ...LIVE_SESSION, revokedAt: new Date() };
      const { service } = makeService(user, revoked);

      await expect(service.refresh('user-1', 'session-1')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when the session has expired', async () => {
      const user = makeUser();
      const expired = { ...LIVE_SESSION, expiresAt: new Date(Date.now() - 1000) };
      const { service } = makeService(user, expired);

      await expect(service.refresh('user-1', 'session-1')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when the session belongs to a different user', async () => {
      const user = makeUser();
      const foreign = { ...LIVE_SESSION, userId: 'someone-else' };
      const { service } = makeService(user, foreign);

      await expect(service.refresh('user-1', 'session-1')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('revokes exactly the one Session row identified by sid, no other rows (DEC-078)', async () => {
      const { service, sessionUpdate } = makeService(makeUser(), null);

      await service.logout('session-1');

      expect(sessionUpdate).toHaveBeenCalledTimes(1);
      expect(sessionUpdate).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('me', () => {
    it('returns the user view with roles and no passwordHash', async () => {
      const user = makeUser();
      const { service } = makeService(user);

      const result = await service.me('user-1');

      expect(result).toEqual({
        id: 'user-1',
        email: 'ada@example.com',
        name: 'Ada Lovelace',
        status: 'ACTIVE',
        roles: ['SUPER_ADMIN'],
      });
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('rejects when the user no longer exists', async () => {
      const { service } = makeService(null);

      await expect(service.me('ghost')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('buildRefreshCookieOptions', () => {
    it('names the cookie refresh_token, scoped to the auth path', () => {
      expect(REFRESH_COOKIE_NAME).toBe('refresh_token');
      expect(buildRefreshCookieOptions(false).path).toBe('/api/v1/auth');
    });

    it('is always httpOnly and sameSite=lax', () => {
      const options = buildRefreshCookieOptions(true);
      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe('lax');
    });

    it('reflects the COOKIE_SECURE flag passed in (prod-only secure cookie)', () => {
      expect(buildRefreshCookieOptions(true).secure).toBe(true);
      expect(buildRefreshCookieOptions(false).secure).toBe(false);
    });
  });
});
