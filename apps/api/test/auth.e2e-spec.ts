import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { ROLE_NAMES } from '@hub/shared';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { hashPassword } from '../src/modules/auth/auth.service';

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

describe('Auth (e2e)', () => {
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
    // Mirrors main.ts's bootstrap wiring (cookie-parser, ValidationPipe,
    // TransformInterceptor, HttpExceptionFilter, global prefix) — this test
    // exists specifically to prove that wiring, not just the service logic
    // the unit tests already cover in isolation.
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix('api/v1');
    // Mirrors main.ts's `trust proxy` setting: ThrottlerGuard's default
    // tracker is `req.ip`, which Express only derives from `X-Forwarded-For`
    // when a proxy is trusted. Also lets this file give each login() call an
    // independent simulated source IP (below), so the /auth/login throttle
    // (violation 1 fix) can't cross-contaminate the OTHER auth journeys this
    // file exercises (lockout, refresh, logout, etc).
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
    await app.init();

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

  // A fresh fake source IP per call by default: the account-lockout journeys
  // below (e.g. 10+ rapid wrong-password attempts) are testing PER-ACCOUNT
  // lockout in isolation from the PER-SOURCE throttle (violation 1 fix) — in
  // reality a credential-stuffing run can spread across many source IPs
  // against one account, which is exactly the gap per-account lockout closes
  // that IP throttling alone can't. Only the dedicated throttle test below
  // passes an explicit, repeated `ip` to deliberately trip that other guard.
  let ipCounter = 0;
  const nextIp = () => {
    ipCounter += 1;
    return `203.0.113.${ipCounter}`; // TEST-NET-3 (RFC 5737), never a real host
  };

  const login = (email: string, password: string, ip: string = nextIp()) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email, password });

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

    const setCookie = response.headers['set-cookie'] as string[] | undefined;
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

  it('bumps updatedAt on a failed attempt, same as every other User write (recordFailedAttempt raw SQL consistency)', async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: updatedAtUser.id } });

    // Tiny real-time gap so the raw SQL UPDATE's `now()` is provably later
    // than the row's creation-time updatedAt, not just equal at ms
    // granularity.
    await new Promise((resolve) => setTimeout(resolve, 5));

    const response = await login(updatedAtUser.email, WRONG_PASSWORD);
    expect(response.status).toBe(401);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: updatedAtUser.id } });
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });

  it('locks out after 10 failed attempts: an 11th attempt with the CORRECT password is still rejected (E4)', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await login(lockoutUser4.email, WRONG_PASSWORD);
      expect(response.status).toBe(401);
    }

    const eleventhAttempt = await login(lockoutUser4.email, PASSWORD);
    expect(eleventhAttempt.status).toBe(401);
    expect(eleventhAttempt.body).not.toHaveProperty('data');
  });

  it('resets failedLoginAttempts to 0 on success once the failed-attempt window has aged out (E5)', async () => {
    await prisma.user.update({
      where: { id: lockoutUser5.id },
      data: { failedLoginAttempts: 9, firstFailedAttemptAt: new Date(Date.now() - 20 * 60_000) },
    });

    const response = await login(lockoutUser5.email, PASSWORD);
    expect([200, 201]).toContain(response.status);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: lockoutUser5.id } });
    expect(row.failedLoginAttempts).toBe(0);
  });

  it('refresh with a valid cookie returns a new accessToken and a rotated Set-Cookie (E6)', async () => {
    const loginResponse = await login(adminUser.email, PASSWORD);
    const cookie = cookiePair(loginResponse.headers['set-cookie'] as string[] | undefined, 'refresh_token');

    const response = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', cookie!);

    expect([200, 201]).toContain(response.status);
    expect(response.body).toMatchObject({ data: { accessToken: expect.any(String) } });
    expect(hasKeyDeep(response.body, 'passwordHash')).toBe(false);

    // Gate E6 only requires a fresh Set-Cookie be issued, not that its value
    // differs from the pre-refresh one — a same-second refresh legitimately
    // re-signs an identical JWT (sub/sid unchanged, `iat`/`exp` at
    // second-granularity), so asserting inequality here would be flaky, not
    // a real wiring property.
    const newCookie = cookiePair(response.headers['set-cookie'] as string[] | undefined, 'refresh_token');
    expect(newCookie).toBeDefined();
  });

  it('refresh with no cookie is rejected: 401 (E7)', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/refresh');
    expect(response.status).toBe(401);
  });

  it('GET /me with a valid bearer token returns the user, no passwordHash anywhere (E8, E12)', async () => {
    const loginResponse = await login(adminUser.email, PASSWORD);
    const accessToken = loginResponse.body.data.accessToken as string;

    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: { id: adminUser.id, email: adminUser.email, status: 'ACTIVE', roles: ['SUPER_ADMIN'] },
    });
    expect(hasKeyDeep(response.body, 'passwordHash')).toBe(false);
  });

  it('GET /me with a garbage bearer token is rejected: 401 (E9)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer garbage.not.a.jwt');
    expect(response.status).toBe(401);
  });

  it('/me with no Authorization header at all is rejected: 401 (E9)', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/auth/me');
    expect(response.status).toBe(401);
  });

  it('logout clears the cookie and revokes that session: reusing the pre-logout cookie on refresh then fails (E10)', async () => {
    const loginResponse = await login(adminUser.email, PASSWORD);
    const preLogoutCookie = cookiePair(loginResponse.headers['set-cookie'] as string[] | undefined, 'refresh_token')!;

    const logoutResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', preLogoutCookie);

    expect(logoutResponse.status).toBe(204);
    const clearedCookie = (logoutResponse.headers['set-cookie'] as string[] | undefined)?.find((entry) =>
      entry.startsWith('refresh_token='),
    );
    expect(clearedCookie).toBeDefined();
    expect(clearedCookie).toMatch(/^refresh_token=;/);

    const reuseResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', preLogoutCookie);
    expect(reuseResponse.status).toBe(401);
  });

  it('a second concurrent session is unaffected by the first session logging out (E13, DEC-078)', async () => {
    const sessionAResponse = await login(adminUser.email, PASSWORD);
    const sessionBResponse = await login(adminUser.email, PASSWORD);
    const cookieA = cookiePair(sessionAResponse.headers['set-cookie'] as string[] | undefined, 'refresh_token')!;
    const cookieB = cookiePair(sessionBResponse.headers['set-cookie'] as string[] | undefined, 'refresh_token')!;
    expect(cookieA).not.toBe(cookieB);

    const logoutA = await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Cookie', cookieA);
    expect(logoutA.status).toBe(204);

    const refreshB = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', cookieB);
    expect([200, 201]).toContain(refreshB.status);
    expect(refreshB.body).toMatchObject({ data: { accessToken: expect.any(String) } });

    // The session logged out in this same test (A) must independently still
    // be rejected — otherwise this test could pass by accident if logout
    // silently no-oped.
    const refreshA = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', cookieA);
    expect(refreshA.status).toBe(401);
  });

  it('serializes concurrent failed logins: N parallel wrong-password attempts land exactly N increments, not fewer (lost-update race regression)', async () => {
    // Each parallel attempt gets its own simulated source IP (nextIp()) so the
    // per-source throttle (5/60s) can't interfere — this test is isolating the
    // per-ACCOUNT lockout counter's atomicity, not the throttle guard. Fired
    // via Promise.all (not sequential awaits) so all N requests are actually
    // in flight concurrently, which is the only way to reproduce a
    // read-then-write lost-update race: a sequential it()-style loop can't
    // catch this, each request completes (and commits) before the next starts.
    const CONCURRENCY = 5;
    const attempts = Array.from({ length: CONCURRENCY }, () => login(raceUser.email, WRONG_PASSWORD, nextIp()));

    const responses = await Promise.all(attempts);
    responses.forEach((response) => expect(response.status).toBe(401));

    const row = await prisma.user.findUniqueOrThrow({ where: { id: raceUser.id } });
    expect(row.failedLoginAttempts).toBe(CONCURRENCY);
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
});
