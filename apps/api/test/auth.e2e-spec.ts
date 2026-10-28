import { randomUUID } from 'crypto';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { http, startApp } from './support/http';
import { ROLE_NAMES } from '@hub/shared';
import { configureApp } from '../src/app.setup';
import { AuthService, hashPassword } from '../src/modules/auth/auth.service';

// Same env-before-import requirement documented in health.e2e-spec.ts /
// app.module.spec.ts: AppModule wires ConfigModule.forRoot({validate:
// validateEnv}) at @Module decoration time, so required env vars must exist
// before AppModule is evaluated below.
process.env.DATABASE_URL ??= 'postgresql://hub:hub_dev_local_only@localhost:5432/hub_dev';
process.env.JWT_ACCESS_SECRET ??= 'e2e-access-secret-at-least-16-chars';
process.env.JWT_REFRESH_SECRET ??= 'e2e-refresh-secret-at-least-16-chars';
process.env.SUPER_ADMIN_EMAIL ??= 'admin@example.com';
process.env.SUPER_ADMIN_PASSWORD ??= 'e2e-super-admin-password';
process.env.WEB_ORIGIN ??= 'http://localhost:3000';

const PASSWORD = 'Correct-Horse-Battery-Staple-9!';
const WRONG_PASSWORD = 'definitely-wrong-password';

/**
 * Gate E12: a flat top-level check would miss a leak nested inside `user` or
 * a future wrapper — recurse through the whole body so "no passwordHash
 * anywhere" is actually proven, not assumed.
 */
function hasKeyDeep(value: unknown, key: string): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => hasKeyDeep(item, key));
  const record = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, key)) return true;
  return Object.values(record).some((nested) => hasKeyDeep(nested, key));
}

/** Extracts the replayable "name=value" pair out of a raw Set-Cookie header string. */
function cookiePair(setCookie: string[] | undefined, name: string): string | undefined {
  const raw = setCookie?.find((entry) => entry.startsWith(`${name}=`));
  return raw?.split(';')[0];
}

describe('Auth (e2e) [F-27]', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const createdUserIds: string[] = [];

  interface ScratchUser {
    id: string;
    email: string;
  }

  async function createScratchUser(emailPrefix: string, opts: { superAdmin?: boolean } = {}): Promise<ScratchUser> {
    const email = `${emailPrefix}-${randomUUID()}@example.com`;
    const passwordHash = await hashPassword(PASSWORD);
    const user = await prisma.user.create({ data: { email, passwordHash, name: 'Scratch Test User' } });
    createdUserIds.push(user.id);

    if (opts.superAdmin) {
      // Reuses the real SUPER_ADMIN Role row if one already exists (it does,
      // from Batch 11's bootstrap seed) rather than creating a duplicate —
      // this Role row is shared and must never be deleted by this file's
      // cleanup (other Users, including the real seeded admin, reference it).
      const role = await prisma.role.upsert({
        where: { name: ROLE_NAMES.SUPER_ADMIN },
        update: {},
        create: { name: ROLE_NAMES.SUPER_ADMIN },
      });
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    }

    return { id: user.id, email };
  }

  let adminUser: ScratchUser;
  let lockoutUser3: ScratchUser;
  let lockoutUser4: ScratchUser;
  let lockoutUser5: ScratchUser;
  let throttleUser: ScratchUser;
  let raceUser: ScratchUser;
  let updatedAtUser: ScratchUser;

  beforeAll(async () => {
    // configureApp is the same wiring main.ts uses — this test exists
    // specifically to prove that wiring, not just the service logic the unit
    // tests already cover in isolation.
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    // configureApp trusts the proxy, so each login() call below can use an
    // independent simulated source IP (X-Forwarded-For) and the /auth/login
    // throttle can't cross-contaminate the OTHER auth journeys this file
    // exercises (lockout, refresh, logout, etc).
    configureApp(app);
    await startApp(app);

    // Five independent scratch users, one per test that needs to mutate
    // lockout/throttle state, so no test's failed-attempt or request counter
    // interferes with another's expected count (CLAUDE.md surgical-changes
    // spirit applied to test isolation, not just production code).
    adminUser = await createScratchUser('auth-e2e-admin', { superAdmin: true });
    lockoutUser3 = await createScratchUser('auth-e2e-wrongpw');
    lockoutUser4 = await createScratchUser('auth-e2e-lockout');
    lockoutUser5 = await createScratchUser('auth-e2e-windowreset');
    throttleUser = await createScratchUser('auth-e2e-throttle');
    raceUser = await createScratchUser('auth-e2e-race');
    updatedAtUser = await createScratchUser('auth-e2e-updatedat');
  });

  afterAll(async () => {
    // Clean up only what this file created. Never deletes the SUPER_ADMIN
    // Role row itself (shared with the real seeded admin; Session/UserRole's
    // onDelete: Restrict would refuse it anyway while still referenced).
    await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
    await app.close();
  });

  // A fresh fake source IP per call by default: lockout is keyed on (account,
  // client IP) (DEC-115), so distinct IPs keep each test's failure rows and the
  // per-source throttle independent. Only the dedicated throttle and race tests
  // pass an explicit, repeated `ip`. HTTP lockout journeys live in
  // auth-lockout.e2e-spec.ts (threshold 3); here the default 10 is pinned via
  // AuthService.login directly.
  let ipCounter = 0;
  const nextIp = () => {
    ipCounter += 1;
    return `203.0.113.${ipCounter}`; // TEST-NET-3 (RFC 5737), never a real host
  };

  const login = (email: string, password: string, ip: string = nextIp()) =>
    http(app).post('/api/v1/auth/login').set('X-Forwarded-For', ip).send({ email, password });

  it('logs in with correct credentials: 200/201 body shape + httpOnly/SameSite=Lax refresh cookie (E2, E12)', async () => {
    const response = await login(adminUser.email, PASSWORD);

    expect([200, 201]).toContain(response.status);
    expect(response.body).toMatchObject({
      data: {
        accessToken: expect.any(String),
        user: { email: adminUser.email, roles: ['SUPER_ADMIN'] },
      },
    });
    expect(hasKeyDeep(response.body, 'passwordHash')).toBe(false);

    const setCookie = response.headers['set-cookie'] as unknown as string[] | undefined;
    const refreshCookieHeader = setCookie?.find((entry) => entry.startsWith('refresh_token='));
    expect(refreshCookieHeader).toBeDefined();
    expect(refreshCookieHeader).toMatch(/HttpOnly/);
    expect(refreshCookieHeader).toMatch(/SameSite=Lax/);
  });

  it('rejects a wrong password: 401, no accessToken, no refresh cookie (E3)', async () => {
    const response = await login(lockoutUser3.email, WRONG_PASSWORD);

    expect(response.status).toBe(401);
    expect(response.body).not.toHaveProperty('data');
    expect(hasKeyDeep(response.body, 'accessToken')).toBe(false);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('records a login_attempts row for (user, ip) on a failed attempt, with updatedAt after the user was created', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: updatedAtUser.id } });
    const ip = nextIp();

    // Tiny real-time gap so the upsert's `now()` is provably later than the
    // user's creation time, not just equal at ms granularity.
    await new Promise((resolve) => setTimeout(resolve, 5));

    const response = await login(updatedAtUser.email, WRONG_PASSWORD, ip);
    expect(response.status).toBe(401);

    const row = await prisma.loginAttempt.findUniqueOrThrow({
      where: { userId_ip: { userId: updatedAtUser.id, ip } },
    });
    expect(row.failedCount).toBe(1);
    expect(row.updatedAt.getTime()).toBeGreaterThan(user.createdAt.getTime());
  });

  it('locks (user, ip) out at the default threshold of 10 failed attempts; other IPs unaffected (E4)', async () => {
    // Driven through AuthService directly: 10 HTTP calls from one IP would
    // trip the 5/60s login throttle. This pins the default LOCKOUT_MAX_ATTEMPTS=10.
    const authService = app.get(AuthService);
    const ip = nextIp();
    const where = { userId_ip: { userId: lockoutUser4.id, ip } };

    for (let attempt = 1; attempt <= 9; attempt += 1) {
      await expect(authService.login(lockoutUser4.email, WRONG_PASSWORD, ip)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
    const nine = await prisma.loginAttempt.findUniqueOrThrow({ where });
    expect(nine.failedCount).toBe(9);
    expect(nine.lockoutUntil).toBeNull();

    await expect(authService.login(lockoutUser4.email, WRONG_PASSWORD, ip)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    const ten = await prisma.loginAttempt.findUniqueOrThrow({ where });
    expect(ten.failedCount).toBe(10);
    expect(ten.lockoutUntil).not.toBeNull();

    const locked = await login(lockoutUser4.email, PASSWORD, ip);
    expect(locked.status).toBe(401);
    expect(locked.body).not.toHaveProperty('data');

    const elsewhere = await login(lockoutUser4.email, PASSWORD, nextIp());
    expect(elsewhere.status).toBe(201);
  });

  it('deletes the (user, ip) failure row on success once the failed-attempt window has aged out (E5)', async () => {
    const ip = nextIp();
    await prisma.loginAttempt.create({
      data: {
        userId: lockoutUser5.id,
        ip,
        failedCount: 9,
        firstFailedAt: new Date(Date.now() - 20 * 60_000),
        lockoutUntil: null,
        updatedAt: new Date(),
      },
    });

    const response = await login(lockoutUser5.email, PASSWORD, ip);
    expect([200, 201]).toContain(response.status);

    const row = await prisma.loginAttempt.findUnique({ where: { userId_ip: { userId: lockoutUser5.id, ip } } });
    expect(row).toBeNull();
  });

  it('refresh with a valid cookie returns a new accessToken and a rotated Set-Cookie (E6)', async () => {
    const loginResponse = await login(adminUser.email, PASSWORD);
    const cookie = cookiePair(loginResponse.headers['set-cookie'] as unknown as string[] | undefined, 'refresh_token');

    const response = await http(app).post('/api/v1/auth/refresh').set('Cookie', cookie!);

    expect([200, 201]).toContain(response.status);
    expect(response.body).toMatchObject({ data: { accessToken: expect.any(String) } });
    expect(hasKeyDeep(response.body, 'passwordHash')).toBe(false);

    // Gate E6 only requires a fresh Set-Cookie be issued, not that its value
    // differs from the pre-refresh one — a same-second refresh legitimately
    // re-signs an identical JWT (sub/sid unchanged, `iat`/`exp` at
    // second-granularity), so asserting inequality here would be flaky, not
    // a real wiring property.
    const newCookie = cookiePair(response.headers['set-cookie'] as unknown as string[] | undefined, 'refresh_token');
    expect(newCookie).toBeDefined();
  });

  it('refresh with no cookie is rejected: 401 (E7)', async () => {
    const response = await http(app).post('/api/v1/auth/refresh');
    expect(response.status).toBe(401);
  });

  it('GET /me with a valid bearer token returns the user, no passwordHash anywhere (E8, E12)', async () => {
    const loginResponse = await login(adminUser.email, PASSWORD);
    const accessToken = loginResponse.body.data.accessToken as string;

    const response = await http(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: { id: adminUser.id, email: adminUser.email, status: 'ACTIVE', roles: ['SUPER_ADMIN'] },
    });
    expect(hasKeyDeep(response.body, 'passwordHash')).toBe(false);
  });

  it('GET /me with a garbage bearer token is rejected: 401 (E9)', async () => {
    const response = await http(app).get('/api/v1/auth/me').set('Authorization', 'Bearer garbage.not.a.jwt');
    expect(response.status).toBe(401);
  });

  it('/me with no Authorization header at all is rejected: 401 (E9)', async () => {
    const response = await http(app).get('/api/v1/auth/me');
    expect(response.status).toBe(401);
  });

  it('logout clears the cookie and revokes that session: reusing the pre-logout cookie on refresh then fails (E10)', async () => {
    const loginResponse = await login(adminUser.email, PASSWORD);
    const preLogoutCookie = cookiePair(
      loginResponse.headers['set-cookie'] as unknown as string[] | undefined,
      'refresh_token',
    )!;

    const logoutResponse = await http(app).post('/api/v1/auth/logout').set('Cookie', preLogoutCookie);

    expect(logoutResponse.status).toBe(204);
    const clearedCookie = (logoutResponse.headers['set-cookie'] as unknown as string[] | undefined)?.find((entry) =>
      entry.startsWith('refresh_token='),
    );
    expect(clearedCookie).toBeDefined();
    expect(clearedCookie).toMatch(/^refresh_token=;/);

    const reuseResponse = await http(app).post('/api/v1/auth/refresh').set('Cookie', preLogoutCookie);
    expect(reuseResponse.status).toBe(401);
  });

  it('a second concurrent session is unaffected by the first session logging out (E13, DEC-078)', async () => {
    const sessionAResponse = await login(adminUser.email, PASSWORD);
    const sessionBResponse = await login(adminUser.email, PASSWORD);
    const cookieA = cookiePair(
      sessionAResponse.headers['set-cookie'] as unknown as string[] | undefined,
      'refresh_token',
    )!;
    const cookieB = cookiePair(
      sessionBResponse.headers['set-cookie'] as unknown as string[] | undefined,
      'refresh_token',
    )!;
    expect(cookieA).not.toBe(cookieB);

    const logoutA = await http(app).post('/api/v1/auth/logout').set('Cookie', cookieA);
    expect(logoutA.status).toBe(204);

    const refreshB = await http(app).post('/api/v1/auth/refresh').set('Cookie', cookieB);
    expect([200, 201]).toContain(refreshB.status);
    expect(refreshB.body).toMatchObject({ data: { accessToken: expect.any(String) } });

    // The session logged out in this same test (A) must independently still
    // be rejected — otherwise this test could pass by accident if logout
    // silently no-oped.
    const refreshA = await http(app).post('/api/v1/auth/refresh').set('Cookie', cookieA);
    expect(refreshA.status).toBe(401);
  });

  it('serializes concurrent failed logins: N parallel wrong-password attempts land exactly N increments, not fewer (lost-update race regression)', async () => {
    // All attempts share ONE fixed IP (the row key is (user, ip)); exactly the
    // throttle limit (5/60s) so none is 429. This isolates the counter's
    // atomicity, not the throttle guard. Fired
    // via Promise.all (not sequential awaits) so all N requests are actually
    // in flight concurrently, which is the only way to reproduce a
    // read-then-write lost-update race: a sequential it()-style loop can't
    // catch this, each request completes (and commits) before the next starts.
    const CONCURRENCY = 5;
    const raceIp = '198.51.100.99';
    const attempts = Array.from({ length: CONCURRENCY }, () => login(raceUser.email, WRONG_PASSWORD, raceIp));

    const responses = await Promise.all(attempts);
    responses.forEach((response) => expect(response.status).toBe(401));

    const row = await prisma.loginAttempt.findUniqueOrThrow({
      where: { userId_ip: { userId: raceUser.id, ip: raceIp } },
    });
    expect(row.failedCount).toBe(CONCURRENCY);
  });

  it('rate-limits POST /auth/login per source: attempts beyond the configured limit get 429 (violation 1 fix)', async () => {
    // Fixed, deliberately-reused source IP (unlike every other test in this
    // file, which gets a fresh one per call via nextIp()) — this is the one
    // test that WANTS the same-source bucket to fill up. Must match
    // auth.controller.ts's @Throttle({ default: { limit, ttl } }) exactly.
    const SOURCE_IP = '198.51.100.42'; // TEST-NET-2 (RFC 5737)
    const LIMIT = 5;

    for (let attempt = 0; attempt < LIMIT; attempt += 1) {
      const response = await login(throttleUser.email, WRONG_PASSWORD, SOURCE_IP);
      // Still under the limit: normal auth rejection, not throttled.
      expect(response.status).toBe(401);
    }

    const overLimit = await login(throttleUser.email, WRONG_PASSWORD, SOURCE_IP);
    expect(overLimit.status).toBe(429);
    expect(overLimit.body).toMatchObject({ error: { statusCode: 429 } });
  });

  describe('login email normalization [F-27]', () => {
    const variants = (email: string) => [email.toUpperCase(), `  ${email}  `, `  ${email.toUpperCase()}  `];
    let normUser: ScratchUser;
    let normLockoutUser: ScratchUser;
    let normWrongPwUser: ScratchUser;

    beforeAll(async () => {
      normUser = await createScratchUser('auth-e2e-norm');
      normLockoutUser = await createScratchUser('auth-e2e-normlock');
      normWrongPwUser = await createScratchUser('auth-e2e-normwrong');
    });

    it('logs in with a mixed-case or padded email against the lowercase stored account [F-27]', async () => {
      for (const typed of variants(normUser.email)) {
        const response = await login(typed, PASSWORD);
        expect([200, 201]).toContain(response.status);
        expect(response.body).toMatchObject({ data: { user: { email: normUser.email } } });
        expect(hasKeyDeep(response.body, 'passwordHash')).toBe(false);
      }
    });

    it('unknown mixed-case email gets the same generic 401 message as a wrong password [F-27]', async () => {
      const unknown = await login(`NOBODY-${randomUUID()}@Example.com`, PASSWORD);
      const wrongPassword = await login(normUser.email, WRONG_PASSWORD);

      expect(unknown.status).toBe(401);
      expect(wrongPassword.status).toBe(401);
      expect(unknown.body).toEqual(wrongPassword.body);
      expect(unknown.body).toMatchObject({ error: { message: 'Invalid credentials' } });
    });

    it('wrong password with a mixed-case email counts one failed attempt on the real row [F-27]', async () => {
      const ip = nextIp();
      const response = await login(normWrongPwUser.email.toUpperCase(), WRONG_PASSWORD, ip);
      expect(response.status).toBe(401);

      const row = await prisma.loginAttempt.findUniqueOrThrow({
        where: { userId_ip: { userId: normWrongPwUser.id, ip } },
      });
      expect(row.failedCount).toBe(1);
    });

    it('lockout counter is shared across case and padding variants, and locks every variant [F-27]', async () => {
      const typedVariants = [
        normLockoutUser.email,
        normLockoutUser.email.toUpperCase(),
        `  ${normLockoutUser.email}  `,
      ];
      // Through AuthService directly (10 HTTP calls from one IP are throttled).
      const authService = app.get(AuthService);
      const ip = nextIp();
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await expect(
          authService.login(typedVariants[attempt % typedVariants.length], WRONG_PASSWORD, ip),
        ).rejects.toBeInstanceOf(UnauthorizedException);
      }

      const rows = await prisma.loginAttempt.findMany({ where: { userId: normLockoutUser.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].ip).toBe(ip);
      expect(rows[0].failedCount).toBe(10);
      expect(rows[0].lockoutUntil).not.toBeNull();

      for (const typed of [normLockoutUser.email.toUpperCase(), normLockoutUser.email]) {
        const locked = await login(typed, PASSWORD, ip);
        expect(locked.status).toBe(401);
        expect(locked.body).not.toHaveProperty('data');
      }
    });

    it.each([['not-an-email'], [''], ['   ']])('invalid email shape %j is still 400 [F-27]', async (email) => {
      const response = await login(email, PASSWORD);
      expect(response.status).toBe(400);
    });
  });
});
