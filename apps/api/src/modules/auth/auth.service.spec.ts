import * as argon2 from 'argon2';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService, buildRefreshCookieOptions, normalizeClientIp, REFRESH_COOKIE_NAME } from './auth.service';
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

describe('AuthService [F-27]', () => {
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
      lastLoginAt: null,
      userRoles: [{ role: { name: 'SUPER_ADMIN' } }],
      ...overrides,
    };
  }

  const IP_A = '203.0.113.9';
  const IP_B = '203.0.113.10';

  function makeService(
    user: unknown,
    session: unknown = null,
    attempt: unknown = null,
    queryRawRows: unknown[] = [{ failed_count: 1, lockout_until: null }],
  ) {
    const findUnique = jest.fn().mockResolvedValue(user);
    const update = jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...(user as object), ...data }));
    const queryRaw = jest.fn().mockResolvedValue(queryRawRows);
    const loginAttemptFindUnique = jest.fn().mockResolvedValue(attempt);
    const loginAttemptDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const sessionCreate = jest.fn().mockResolvedValue(session);
    const sessionUpdate = jest.fn().mockResolvedValue(session);
    const sessionFindUnique = jest.fn().mockResolvedValue(session);
    const prisma = {
      user: { findUnique, update },
      session: { create: sessionCreate, update: sessionUpdate, findUnique: sessionFindUnique },
      loginAttempt: { findUnique: loginAttemptFindUnique, deleteMany: loginAttemptDeleteMany },
      $queryRaw: queryRaw,
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
    return {
      service,
      findUnique,
      update,
      queryRaw,
      loginAttemptFindUnique,
      loginAttemptDeleteMany,
      signAsync,
      decode,
      sessionCreate,
      sessionUpdate,
      sessionFindUnique,
    };
  }

  describe('login', () => {
    it('sets lastLoginAt only (no legacy lockout keys), deletes its own (user, ip) attempt row, returns tokens on success', async () => {
      const { service, update, loginAttemptDeleteMany } = makeService(makeUser());

      const result = await service.login('ada@example.com', CORRECT_PASSWORD, IP_A);

      expect(update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { lastLoginAt: expect.any(Date) },
      });
      expect(loginAttemptDeleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1', ip: IP_A } });
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

    it('normalizes (trim + lowercase) the identifier before the user lookup', async () => {
      const { service, findUnique } = makeService(makeUser());

      await service.login('  ADA@Example.com ', CORRECT_PASSWORD);

      expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'ada@example.com' } }));
    });

    it('rejects an unknown mixed-case email with the same generic message, creating no attempt state', async () => {
      const { service, findUnique, update, queryRaw, loginAttemptFindUnique, sessionCreate } = makeService(null);

      await expect(service.login('  GHOST@Example.com ', 'whatever', IP_A)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );
      expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'ghost@example.com' } }));
      expect(update).not.toHaveBeenCalled();
      expect(queryRaw).not.toHaveBeenCalled();
      expect(loginAttemptFindUnique).not.toHaveBeenCalled();
      expect(sessionCreate).not.toHaveBeenCalled();
    });

    it('creates no attempt state for an INACTIVE user', async () => {
      const { service, queryRaw, loginAttemptFindUnique } = makeService(makeUser({ status: 'INACTIVE' }));

      await expect(service.login('ada@example.com', 'wrong-password', IP_A)).rejects.toThrow(UnauthorizedException);
      expect(queryRaw).not.toHaveBeenCalled();
      expect(loginAttemptFindUnique).not.toHaveBeenCalled();
    });

    // The window state machine (reset-if-expired vs increment, trip-at-max) lives
    // entirely inside one atomic INSERT..ON CONFLICT..RETURNING (see
    // recordFailedAttempt) so concurrent failures cannot lose updates; auth
    // e2e files drive it through a real Postgres. This unit level only proves
    // delegation to that single statement keyed on (user, normalized ip).
    it('records a wrong-password attempt via exactly one atomic $queryRaw upsert, never a read-then-write user.update (race-safety)', async () => {
      const { service, update, queryRaw, sessionCreate } = makeService(makeUser());

      await expect(service.login('ada@example.com', 'wrong-password', '::ffff:203.0.113.9')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(queryRaw).toHaveBeenCalledTimes(1);
      const values = queryRaw.mock.calls[0].slice(1);
      expect(values).toContain('user-1');
      expect(values).toContain(IP_A);
      expect(update).not.toHaveBeenCalled();
      expect(sessionCreate).not.toHaveBeenCalled();
    });

    it("prunes all users' stale attempt rows after a failure", async () => {
      const { service, loginAttemptDeleteMany } = makeService(makeUser());

      await expect(service.login('ada@example.com', 'wrong-password', IP_A)).rejects.toThrow(UnauthorizedException);

      expect(loginAttemptDeleteMany).toHaveBeenCalledTimes(1);
      const arg = loginAttemptDeleteMany.mock.calls[0][0];
      expect(arg.where).not.toHaveProperty('userId');
      expect(arg.where.firstFailedAt).toEqual({ lt: expect.any(Date) });
      // live-lock guard: a still-locked row (even with a stale window) must never be swept.
      expect(arg.where.OR).toEqual([{ lockoutUntil: null }, { lockoutUntil: { lte: expect.any(Date) } }]);
    });

    // Minimal spy on argon2.hash (only way to force a hash failure) in an isolated
    // module registry, since the dummy-hash memo is module-level state.
    it('a rejected dummy hash neither 500s the unknown-email login nor stays memoized', async () => {
      // isolated registry => different UnauthorizedException class; match by shape.
      const GENERIC_401 = { name: 'UnauthorizedException', message: 'Invalid credentials' };
      let isolatedArgon2!: typeof argon2;
      let isolated!: typeof import('./auth.service');
      jest.isolateModules(() => {
        isolatedArgon2 = require('argon2');
        isolated = require('./auth.service');
      });
      const hashSpy = jest.spyOn(isolatedArgon2, 'hash').mockRejectedValueOnce(new Error('hash boom'));
      const prisma = { user: { findUnique: jest.fn().mockResolvedValue(null) } } as unknown as PrismaService;
      const service = new isolated.AuthService(prisma, {} as JwtService, {} as ConfigService);

      await expect(service.login('ghost@example.com', 'x', IP_A)).rejects.toMatchObject(GENERIC_401);
      expect(hashSpy).toHaveBeenCalledTimes(1);

      await expect(service.login('ghost@example.com', 'x', IP_A)).rejects.toMatchObject(GENERIC_401);
      expect(hashSpy).toHaveBeenCalledTimes(2); // retried, not stuck on the rejected promise
      await expect(service.login('ghost@example.com', 'x', IP_A)).rejects.toMatchObject(GENERIC_401);
      expect(hashSpy).toHaveBeenCalledTimes(2); // recovered value now memoized
      hashSpy.mockRestore();
    });

    it('rejects a (user, ip) locked row even with the correct password, without verifying or touching other IPs', async () => {
      const attempt = { failedCount: 10, lockoutUntil: new Date(Date.now() + 5 * 60_000) };
      const { service, update, queryRaw, loginAttemptFindUnique, loginAttemptDeleteMany } = makeService(
        makeUser(),
        null,
        attempt,
      );

      await expect(service.login('ada@example.com', CORRECT_PASSWORD, IP_A)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );
      expect(loginAttemptFindUnique).toHaveBeenCalledWith({
        where: { userId_ip: { userId: 'user-1', ip: IP_A } },
      });
      expect(update).not.toHaveBeenCalled();
      expect(queryRaw).not.toHaveBeenCalled();
      expect(loginAttemptDeleteMany).not.toHaveBeenCalled();
    });

    it('same user from another IP is unaffected: lookup is keyed on that IP and succeeds', async () => {
      // Row exists only for IP_A; lookup for IP_B returns null (as Prisma would).
      const { service, loginAttemptFindUnique } = makeService(makeUser());
      loginAttemptFindUnique.mockImplementation(({ where }) =>
        Promise.resolve(
          where.userId_ip.ip === IP_A ? { failedCount: 10, lockoutUntil: new Date(Date.now() + 60_000) } : null,
        ),
      );

      await expect(service.login('ada@example.com', CORRECT_PASSWORD, IP_A)).rejects.toThrow(UnauthorizedException);
      const ok = await service.login('ada@example.com', CORRECT_PASSWORD, IP_B);

      expect(ok.accessToken).toBeDefined();
      expect(loginAttemptFindUnique).toHaveBeenLastCalledWith({ where: { userId_ip: { userId: 'user-1', ip: IP_B } } });
    });

    it('allows login again once lockoutUntil has passed', async () => {
      const attempt = { failedCount: 10, lockoutUntil: new Date(Date.now() - 1000) };
      const { service, update, loginAttemptDeleteMany } = makeService(makeUser(), null, attempt);

      const result = await service.login('ada@example.com', CORRECT_PASSWORD, IP_A);

      expect(result.accessToken).toBeDefined();
      expect(update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { lastLoginAt: expect.any(Date) } });
      expect(loginAttemptDeleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1', ip: IP_A } });
    });

    describe('auth.lockout audit line', () => {
      let logSpy: jest.SpyInstance;
      beforeEach(() => {
        logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      });
      afterEach(() => logSpy.mockRestore());

      const auditLines = () =>
        logSpy.mock.calls
          .filter((call) => call[1] === 'Audit' || typeof call[0] === 'string')
          .map((call) => String(call[0]))
          .filter((line) => line.includes('auth.lockout'));

      it('emits exactly one secret-free line on the failure that reaches the threshold', async () => {
        const { service } = makeService(makeUser(), null, null, [{ failed_count: 10, lockout_until: new Date() }]);

        await expect(service.login('ada@example.com', 'wrong-password', IP_A)).rejects.toThrow(UnauthorizedException);

        const lines = auditLines();
        expect(lines).toHaveLength(1);
        expect(JSON.parse(lines[0])).toEqual({
          actorId: null,
          action: 'auth.lockout',
          entityType: 'User',
          entityId: 'user-1',
          ip: IP_A,
        });
        expect(lines[0]).not.toMatch(/password|ada@example\.com/i);
      });

      it('emits no line below the threshold', async () => {
        const { service } = makeService(makeUser(), null, null, [{ failed_count: 3, lockout_until: null }]);

        await expect(service.login('ada@example.com', 'wrong-password', IP_A)).rejects.toThrow(UnauthorizedException);

        expect(auditLines()).toHaveLength(0);
      });
    });
  });

  describe('normalizeClientIp', () => {
    it.each([
      ['::ffff:1.2.3.4', '1.2.3.4'],
      ['2001:DB8::1', '2001:db8:0:0::/64'],
      ['2001:0db8:85a3:0042:1111:2222:3333:4444', '2001:db8:85a3:42::/64'],
      ['::1', '0:0:0:0::/64'],
      ['fe80::1%eth0', 'fe80:0:0:0::/64'],
      ['1::2:3:4:5:6:7', '1:0:2:3::/64'],
      ['1::2:3:4:5:1.2.3.4', '1:0:2:3::/64'],
      ['1:2:3:4:5:6:1.2.3.4', '1:2:3:4::/64'],
      ['203.0.113.9', '203.0.113.9'],
      [undefined, 'unknown'],
      ['', 'unknown'],
    ])('%s -> %s', (input, expected) => {
      expect(normalizeClientIp(input)).toBe(expected);
    });

    it('keys addresses in one IPv6 /64 equal and an adjacent /64 differently', () => {
      const a = normalizeClientIp('2001:db8:1:2::a');
      expect(normalizeClientIp('2001:db8:1:2:ffff:ffff:ffff:ffff')).toBe(a);
      expect(normalizeClientIp('2001:db8:1:3::a')).not.toBe(a);
    });

    it('caps junk at 45 characters', () => {
      expect(normalizeClientIp('A'.repeat(100))).toHaveLength(45);
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
