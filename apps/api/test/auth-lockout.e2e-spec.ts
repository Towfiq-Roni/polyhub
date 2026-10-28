import { randomUUID } from 'crypto';
import { INestApplication, Logger, LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { http, startApp } from './support/http';
import { ROLE_NAMES } from '@hub/shared';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/modules/auth/auth.service';

/*
 * Per-(account, client IP) login lockout (task #52, DEC-115) over HTTP.
 *
 * LOCKOUT_MAX_ATTEMPTS is pinned to 3 for this file ONLY so a lock fits inside
 * the login throttle (5 / 60s per IP). The default threshold 10 is pinned in
 * auth.e2e-spec.ts by calling AuthService.login directly. Parallel-write races
 * (L12) live in auth-lockout-race.e2e-spec.ts at the default threshold.
 *
 * - One app for the file; the in-memory throttler is shared by every test, so
 *   each test draws fresh RFC 5737 IPs from `ip()` and sends <= 5 requests per
 *   IP. Tests are self-contained (own scratch users, own IPs): they run alone
 *   via -t and under --randomize.
 * - Scratch users only (`lockout-e2e-*@example.com`); the seeded admin is never
 *   used. Users are removed in afterAll (login_attempts cascade).
 */

// Env-before-import: AppModule evaluates ConfigModule.forRoot({validate}) at
// decoration time, and LOCKOUT_MAX_ATTEMPTS must be read from this value.
process.env.DATABASE_URL ??= 'postgresql://hub:hub_dev_local_only@localhost:5432/hub_dev';
process.env.JWT_ACCESS_SECRET ??= 'e2e-access-secret-at-least-16-chars';
process.env.JWT_REFRESH_SECRET ??= 'e2e-refresh-secret-at-least-16-chars';
process.env.SUPER_ADMIN_EMAIL ??= 'admin@example.com';
process.env.SUPER_ADMIN_PASSWORD ??= 'e2e-super-admin-password';
process.env.WEB_ORIGIN ??= 'http://localhost:3000';
process.env.LOCKOUT_MAX_ATTEMPTS = '3';

jest.setTimeout(60_000);

const PASSWORD = 'Correct-Horse-Battery-Staple-9!';
const WRONG_PASSWORD = 'definitely-wrong-password';
const MAX = 3;

const prisma = new PrismaClient();
const createdUserIds: string[] = [];

// Distinct, never-repeating source IP per call (TEST-NET-2 then TEST-NET-3).
let ipCounter = 0;
const ip = (): string => {
  ipCounter += 1;
  return ipCounter <= 250 ? `198.51.100.${ipCounter}` : `203.0.113.${ipCounter - 250}`;
};

async function createScratchUser(
  prefix: string,
  opts: { superAdmin?: boolean; status?: 'ACTIVE' | 'INACTIVE' } = {},
): Promise<{ id: string; email: string }> {
  const email = `${prefix}-${randomUUID()}@example.com`;
  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.create({
    data: { email, passwordHash, name: 'Lockout Scratch User', status: opts.status ?? 'ACTIVE' },
  });
  createdUserIds.push(user.id);
  if (opts.superAdmin) {
    // Shared SUPER_ADMIN Role row: reused, never deleted by this file.
    const role = await prisma.role.upsert({
      where: { name: ROLE_NAMES.SUPER_ADMIN },
      update: {},
      create: { name: ROLE_NAMES.SUPER_ADMIN },
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }
  return { id: user.id, email };
}

describe('Per-(account, IP) lockout over HTTP, threshold 3 [F-27]', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await startApp(app);
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
    await app.close();
  });

  const loginVia = (email: string, password: string, xff?: string) => {
    const req = http(app).post('/api/v1/auth/login');
    if (xff !== undefined) req.set('X-Forwarded-For', xff);
    return req.send({ email, password });
  };

  const failFrom = async (email: string, from: string, times: number) => {
    for (let i = 0; i < times; i++) {
      expect((await loginVia(email, WRONG_PASSWORD, from)).status).toBe(401);
    }
  };

  const rowFor = (userId: string, from: string) =>
    prisma.loginAttempt.findUnique({ where: { userId_ip: { userId, ip: from } } });

  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

  it('L1 attacker IP is locked after 3 failures; correct password from it is a bare 401 [F-27]', async () => {
    const victim = await createScratchUser('lockout-e2e-l1');
    const x = ip();
    await failFrom(victim.email, x, MAX);

    const row = await rowFor(victim.id, x);
    expect(row?.failedCount).toBe(MAX);
    expect(row?.lockoutUntil).not.toBeNull();
    expect(row!.lockoutUntil!.getTime()).toBeGreaterThan(Date.now());

    const locked = await loginVia(victim.email, PASSWORD, x);
    expect(locked.status).toBe(401);
    expect(locked.body).not.toHaveProperty('data');
    expect(locked.headers['set-cookie']).toBeUndefined();
  });

  it('L2 same account logs in from another IP right after the attacker locked its own IP [F-27]', async () => {
    const victim = await createScratchUser('lockout-e2e-l2');
    const x = ip();
    const y = ip();
    await failFrom(victim.email, x, MAX);

    const ok = await loginVia(victim.email, PASSWORD, y);
    expect(ok.status).toBe(201);
    expect(ok.body.data.accessToken).toEqual(expect.any(String));
    expect(
      (ok.headers['set-cookie'] as unknown as string[] | undefined)?.some((c) => c.startsWith('refresh_token=')),
    ).toBe(true);
  });

  it('L3 attacker IP stays locked after the victim succeeds elsewhere; its row is untouched [F-27]', async () => {
    const victim = await createScratchUser('lockout-e2e-l3');
    const x = ip();
    const y = ip();
    await failFrom(victim.email, x, MAX);
    const before = await rowFor(victim.id, x);

    expect((await loginVia(victim.email, PASSWORD, y)).status).toBe(201);

    const after = await rowFor(victim.id, x);
    expect(after).toEqual(before);
    const stillLocked = await loginVia(victim.email, PASSWORD, x);
    expect(stillLocked.status).toBe(401);
    expect(stillLocked.body).not.toHaveProperty('data');
  });

  it('L4 a different account from the locked IP logs in normally [F-27]', async () => {
    const victim = await createScratchUser('lockout-e2e-l4a');
    const other = await createScratchUser('lockout-e2e-l4b');
    const x = ip();
    await failFrom(victim.email, x, MAX);

    expect((await loginVia(other.email, PASSWORD, x)).status).toBe(201);
  });

  it('L5 locked, wrong-password and unknown-email responses are identical generic 401s [F-27]', async () => {
    const lockedUser = await createScratchUser('lockout-e2e-l5a');
    const plainUser = await createScratchUser('lockout-e2e-l5b');
    const x = ip();
    await failFrom(lockedUser.email, x, MAX);

    const locked = await loginVia(lockedUser.email, PASSWORD, x);
    const wrong = await loginVia(plainUser.email, WRONG_PASSWORD, ip());
    const unknown = await loginVia(`lockout-e2e-nobody-${randomUUID()}@example.com`, PASSWORD, ip());

    for (const res of [locked, wrong, unknown]) {
      expect(res.status).toBe(401);
      expect(res.body.error.statusCode).toBe(401);
      expect(res.body.error.message).toBe('Invalid credentials');
    }
    expect(locked.body).toEqual(wrong.body);
    expect(locked.body).toEqual(unknown.body);
  });

  it('L6 a distributed attacker (4 IPs x 3 failures) locks only its own IPs; the victim from a fresh IP gets in [F-27]', async () => {
    const victim = await createScratchUser('lockout-e2e-l6');
    const attackerIps = [ip(), ip(), ip(), ip()];
    for (const a of attackerIps) await failFrom(victim.email, a, MAX);

    const victimIp = ip();
    expect((await loginVia(victim.email, PASSWORD, victimIp)).status).toBe(201);

    const rows = await prisma.loginAttempt.findMany({ where: { userId: victim.id } });
    // The successful login removes only the victim's own (user, ip) row, which never existed.
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.lockoutUntil !== null && r.failedCount === MAX)).toBe(true);
    expect(rows.map((r) => r.ip).sort()).toEqual([...attackerIps].sort());
    expect(rows.some((r) => r.ip === victimIp)).toBe(false);
  });

  it('L7 SUPER_ADMIN scratch user locked from one IP still logs in from another, not from the locked one [F-27]', async () => {
    const admin = await createScratchUser('lockout-e2e-l7', { superAdmin: true });
    const x = ip();
    const y = ip();
    await failFrom(admin.email, x, MAX);

    const fromY = await loginVia(admin.email, PASSWORD, y);
    expect(fromY.status).toBe(201);
    expect(fromY.body.data.user.roles).toContain('SUPER_ADMIN');

    const fromX = await loginVia(admin.email, PASSWORD, x);
    expect(fromX.status).toBe(401);
    expect(fromX.body).not.toHaveProperty('data');
  });

  it('L8 an expired lock no longer blocks: correct password succeeds and the row is deleted [F-27]', async () => {
    const user = await createScratchUser('lockout-e2e-l8');
    const x = ip();
    await failFrom(user.email, x, MAX);
    await prisma.loginAttempt.update({
      where: { userId_ip: { userId: user.id, ip: x } },
      data: { lockoutUntil: new Date(Date.now() - 60_000), firstFailedAt: minutesAgo(20) },
    });

    expect((await loginVia(user.email, PASSWORD, x)).status).toBe(201);
    expect(await rowFor(user.id, x)).toBeNull();
  });

  it('L9 a failure after the window aged out restarts the count at 1 with no lock [F-27]', async () => {
    const user = await createScratchUser('lockout-e2e-l9');
    const x = ip();
    await prisma.loginAttempt.create({
      data: { userId: user.id, ip: x, failedCount: 2, firstFailedAt: minutesAgo(20), updatedAt: new Date() },
    });

    expect((await loginVia(user.email, WRONG_PASSWORD, x)).status).toBe(401);

    const row = await rowFor(user.id, x);
    expect(row?.failedCount).toBe(1);
    expect(row?.lockoutUntil).toBeNull();
    expect(Math.abs(row!.firstFailedAt.getTime() - Date.now())).toBeLessThan(5_000);
  });

  it('L10 a successful login clears its own failure row [F-27]', async () => {
    const user = await createScratchUser('lockout-e2e-l10');
    const x = ip();
    await failFrom(user.email, x, 2);
    expect((await rowFor(user.id, x))?.failedCount).toBe(2);

    expect((await loginVia(user.email, PASSWORD, x)).status).toBe(201);
    expect(await rowFor(user.id, x)).toBeNull();
  });

  it('L11 unknown and INACTIVE emails never create login_attempts rows [F-27]', async () => {
    const inactive = await createScratchUser('lockout-e2e-l11', { status: 'INACTIVE' });
    const x = ip();
    expect((await loginVia(`lockout-e2e-ghost-${randomUUID()}@example.com`, WRONG_PASSWORD, x)).status).toBe(401);
    expect((await loginVia(inactive.email, WRONG_PASSWORD, x)).status).toBe(401);
    expect((await loginVia(inactive.email, PASSWORD, x)).status).toBe(401);

    expect(await prisma.loginAttempt.count({ where: { ip: x } })).toBe(0);
  });

  it('L13 without X-Forwarded-For the stored ip is the socket peer, non-empty and not ::ffff: prefixed [F-27]', async () => {
    const user = await createScratchUser('lockout-e2e-l13');
    expect((await loginVia(user.email, WRONG_PASSWORD)).status).toBe(401);

    const rows = await prisma.loginAttempt.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].ip.length).toBeGreaterThan(0);
    expect(rows[0].ip.startsWith('::ffff:')).toBe(false);
    // Controller must forward req.ip: the loopback peer, never the 'unknown' fallback.
    expect(rows[0].ip).not.toBe('unknown');
    expect(['127.0.0.1', '::1']).toContain(rows[0].ip);
  });

  it('L14 admin activate clears every IP row of the user; the locked IP can log in again [F-27]', async () => {
    const admin = await createScratchUser('lockout-e2e-l14admin', { superAdmin: true });
    const victim = await createScratchUser('lockout-e2e-l14');
    const x = ip();
    await failFrom(victim.email, x, MAX);
    expect((await rowFor(victim.id, x))?.lockoutUntil).not.toBeNull();

    const adminLogin = await loginVia(admin.email, PASSWORD, ip());
    expect(adminLogin.status).toBe(201);
    const token = adminLogin.body.data.accessToken as string;

    const activate = await http(app)
      .post(`/api/v1/users/${victim.id}/activate`)
      .set('Authorization', `Bearer ${token}`);
    expect(activate.status).toBe(200);
    expect(await prisma.loginAttempt.count({ where: { userId: victim.id } })).toBe(0);

    expect((await loginVia(victim.email, PASSWORD, x)).status).toBe(201);
  });

  // IPv6 clients arrive via X-Forwarded-For (trust proxy 1) and are keyed on their /64.
  describe('IPv6 /64 key, global prune, timing [F-27]', () => {
    it('L16 three addresses inside one /64 share one lock row; a fourth address in it is locked [F-27]', async () => {
      const user = await createScratchUser('lockout-e2e-l16');
      for (const a of ['2001:db8:56:1::a', '2001:db8:56:1::b', '2001:db8:56:1:1:2:3:4']) {
        await failFrom(user.email, a, 1);
      }

      const locked = await loginVia(user.email, PASSWORD, '2001:db8:56:1::c');
      expect(locked.status).toBe(401);
      expect(locked.body).not.toHaveProperty('data');
      expect(locked.headers['set-cookie']).toBeUndefined();

      const rows = await prisma.loginAttempt.findMany({ where: { userId: user.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].ip).toBe('2001:db8:56:1::/64');
      expect(rows[0].failedCount).toBe(MAX);
      expect(rows[0].lockoutUntil).not.toBeNull();
    });

    it('L17 an adjacent /64 and an IPv4 client are unaffected by a locked /64 [F-27]', async () => {
      const user = await createScratchUser('lockout-e2e-l17');
      for (const a of ['2001:db8:57:1::a', '2001:db8:57:1::b', '2001:db8:57:1::c']) {
        await failFrom(user.email, a, 1);
      }
      const before = await rowFor(user.id, '2001:db8:57:1::/64');
      expect(before?.lockoutUntil).not.toBeNull();

      expect((await loginVia(user.email, PASSWORD, '2001:db8:57:2::a')).status).toBe(201);
      expect((await loginVia(user.email, PASSWORD, ip())).status).toBe(201);

      expect(await rowFor(user.id, '2001:db8:57:1::/64')).toEqual(before);
      expect(before?.failedCount).toBe(MAX);
    });

    it("L18 a failure sweeps another user's dead rows; live locks and fresh rows survive [F-27]", async () => {
      const x = await createScratchUser('lockout-e2e-l18x');
      const y = await createScratchUser('lockout-e2e-l18y');
      const [ipA, ipB, ipC, ipY] = [ip(), ip(), ip(), ip()];
      const base = { failedCount: 1, updatedAt: new Date() };
      await prisma.loginAttempt.createMany({
        data: [
          { userId: x.id, ip: ipA, ...base, firstFailedAt: minutesAgo(20) },
          {
            userId: x.id,
            ip: ipB,
            ...base,
            failedCount: MAX,
            firstFailedAt: minutesAgo(20),
            lockoutUntil: new Date(Date.now() + 10 * 60_000),
          },
          { userId: x.id, ip: ipC, ...base, firstFailedAt: minutesAgo(1) },
        ],
      });

      await failFrom(y.email, ipY, 1);

      expect(await rowFor(x.id, ipA)).toBeNull();
      expect(await rowFor(x.id, ipB)).not.toBeNull();
      expect(await rowFor(x.id, ipC)).not.toBeNull();
      expect((await rowFor(y.id, ipY))?.failedCount).toBe(1);
    });

    it('L19 unknown and INACTIVE emails take a comparable time to a wrong password, with identical responses [F-27]', async () => {
      const inactive = await createScratchUser('lockout-e2e-l19i', { status: 'INACTIVE' });
      const active = await createScratchUser('lockout-e2e-l19a');
      const unknownEmail = () => `lockout-e2e-nobody-${randomUUID()}@example.com`;
      // Warm-up: initialises argon2 and the lazily created dummy hash; result ignored.
      await loginVia(unknownEmail(), WRONG_PASSWORD, ip());

      const sample = async (email: () => string) => {
        const times: number[] = [];
        const bodies: string[] = [];
        for (let i = 0; i < 5; i++) {
          const t0 = performance.now();
          const res = await loginVia(email(), WRONG_PASSWORD, ip());
          times.push(performance.now() - t0);
          expect(res.status).toBe(401);
          bodies.push(JSON.stringify(res.body));
        }
        times.sort((a, b) => a - b);
        return { median: times[Math.floor(times.length / 2)], bodies };
      };
      const unknown = await sample(unknownEmail);
      const off = await sample(() => inactive.email);
      const wrong = await sample(() => active.email);

      const distinct = [...new Set([...unknown.bodies, ...off.bodies, ...wrong.bodies])];
      // Jest expect() takes no message: compare strings so a failure prints the bodies.
      expect(distinct.join(' | ')).toBe(wrong.bodies[0]);
      // Ratio, not absolute ms: a missing dummy verify makes unknown/inactive ~10-20x faster
      // than an argon2 verify; 0.5 leaves wide margin for machine noise.
      const medians = `medians ms unknown=${unknown.median.toFixed(1)} inactive=${off.median.toFixed(1)} wrong=${wrong.median.toFixed(1)}`;
      const floor = 0.5 * wrong.median;
      expect(unknown.median >= floor ? 'ok' : `unknown too fast: ${medians}`).toBe('ok');
      expect(off.median >= floor ? 'ok' : `inactive too fast: ${medians}`).toBe('ok');
    });
  });

  describe('audit line [F-27]', () => {
    const captured: string[] = [];
    const capturingLogger: LoggerService = {
      log: (message: unknown, ...rest: unknown[]) => {
        if (rest[rest.length - 1] === 'Audit') captured.push(String(message));
      },
      error: () => undefined,
      warn: () => undefined,
    };
    let previousLogger: unknown;

    beforeAll(() => {
      previousLogger = (Logger as unknown as { staticInstanceRef: unknown }).staticInstanceRef;
      Logger.overrideLogger(capturingLogger);
    });
    afterAll(() => {
      Logger.overrideLogger(previousLogger as LoggerService);
    });
    beforeEach(() => {
      captured.length = 0;
    });

    it('L15 auth.lockout is logged once, at the threshold failure, without secrets [F-27]', async () => {
      const user = await createScratchUser('lockout-e2e-l15');
      const x = ip();
      await failFrom(user.email, x, MAX - 1);
      expect(captured.filter((l) => l.includes('auth.lockout'))).toHaveLength(0);

      await failFrom(user.email, x, 1);
      const lockLines = captured.filter((l) => l.includes('auth.lockout'));
      expect(lockLines).toHaveLength(1);
      const parsed = JSON.parse(lockLines[0]) as Record<string, unknown>;
      expect(parsed.entityId).toBe(user.id);
      expect(parsed.ip).toBe(x);
      expect(parsed.action).toBe('auth.lockout');
      const lower = lockLines[0].toLowerCase();
      expect(lower).not.toContain('password');
      expect(lower).not.toContain(user.email.toLowerCase());
    });
  });
});
