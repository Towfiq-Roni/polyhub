import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { http, startApp } from './support/http';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/modules/auth/auth.service';

/*
 * Login throttler (5 / 60s, keyed on Express `req.ip`) and the per-(account, IP)
 * lockout (DEC-115) behind the production `trust proxy` hop count.
 *
 * Apps are configured by the shared `configureApp` (the same call main.ts
 * makes), so the hop count comes from `TRUST_PROXY_HOPS`; only the D4 control
 * overrides it.
 *
 * - XFF independence is an APP-level property: behind nginx the edge
 *   overwrites X-Forwarded-For (and nginx `limit_req` keys on the real peer),
 *   so clients cannot rotate either bucket through nginx. Hitting the API
 *   directly, a varying XFF DOES rotate the app bucket; these tests prove it.
 * - Lockout is keyed on (account, client IP) (DEC-115, supersedes the
 *   per-account clause of DEC-111): failures from many IPs never lock the
 *   account for anyone else (D5). The lock-on-threshold journeys live in
 *   auth-lockout.e2e-spec.ts (threshold 3).
 * - Each describe boots its own app (in-memory throttler storage is per app).
 * - Describe order: D1 forwarded-IP bucket (192.0.2.10-30); D2 no-XFF socket
 *   peer bucket (own app); D3 multi-hop XFF (192.0.2.40-42 + 198.51.100.x
 *   spoofed lefts); D4 trust proxy off control (192.0.2.50-55); D5 lockout
 *   does not spread across IPs (203.0.113.x).
 * - Every test is self-contained (runs alone via -t and under --randomize).
 * - Scratch users only; the seeded admin is never used.
 */

// Same env-before-import requirement as auth.e2e-spec.ts: AppModule evaluates
// ConfigModule.forRoot({validate}) at decoration time.
process.env.DATABASE_URL ??= 'postgresql://hub:hub_dev_local_only@localhost:5432/hub_dev';
process.env.JWT_ACCESS_SECRET ??= 'e2e-access-secret-at-least-16-chars';
process.env.JWT_REFRESH_SECRET ??= 'e2e-refresh-secret-at-least-16-chars';
process.env.SUPER_ADMIN_EMAIL ??= 'admin@example.com';
process.env.SUPER_ADMIN_PASSWORD ??= 'e2e-super-admin-password';
process.env.WEB_ORIGIN ??= 'http://localhost:3000';

jest.setTimeout(60_000);

const PASSWORD = 'Correct-Horse-Battery-Staple-9!';
const WRONG_PASSWORD = 'definitely-wrong-password';
const LIMIT = 5;

const prisma = new PrismaClient();
const createdUserIds: string[] = [];

// No argument = production wiring (configureApp, so the hop count follows
// TRUST_PROXY_HOPS and main.ts); an override is only for the D4 control.
async function bootApp(trustProxyOverride?: number | boolean): Promise<INestApplication> {
  const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  if (trustProxyOverride !== undefined) {
    app.getHttpAdapter().getInstance().set('trust proxy', trustProxyOverride);
  }
  await startApp(app);
  return app;
}

async function createScratchUser(prefix: string): Promise<{ id: string; email: string }> {
  const email = `${prefix}-${randomUUID()}@example.com`;
  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.create({ data: { email, passwordHash, name: 'Throttle Scratch User' } });
  createdUserIds.push(user.id);
  return { id: user.id, email };
}

function loginVia(app: INestApplication, email: string, password: string, xff?: string) {
  const req = http(app).post('/api/v1/auth/login');
  if (xff !== undefined) req.set('X-Forwarded-For', xff);
  return req.send({ email, password });
}

afterAll(async () => {
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

describe('Login throttler keys on forwarded client IP under the configureApp production trust-proxy hops [F-27]', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await bootApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('IP A exhausts 5/60s, 6th is 429; IP B still reaches auth', async () => {
    const user = await createScratchUser('throttle-e2e-a');
    for (let i = 0; i < LIMIT; i++) {
      expect((await loginVia(app, user.email, WRONG_PASSWORD, '192.0.2.10')).status).toBe(401);
    }
    const sixth = await loginVia(app, user.email, WRONG_PASSWORD, '192.0.2.10');
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.statusCode).toBe(429);

    expect((await loginVia(app, user.email, WRONG_PASSWORD, '192.0.2.11')).status).toBe(401);
  });

  it('same XFF is throttled together across users', async () => {
    const b1 = await createScratchUser('throttle-e2e-b1');
    const b2 = await createScratchUser('throttle-e2e-b2');
    const users = [b1, b2];
    for (let i = 0; i < LIMIT; i++) {
      expect((await loginVia(app, users[i % 2].email, WRONG_PASSWORD, '192.0.2.20')).status).toBe(401);
    }
    expect((await loginVia(app, b1.email, WRONG_PASSWORD, '192.0.2.20')).status).toBe(429);
  });

  it('successful logins count toward the bucket', async () => {
    const user = await createScratchUser('throttle-e2e-c');
    for (let i = 0; i < 4; i++) {
      expect((await loginVia(app, user.email, WRONG_PASSWORD, '192.0.2.30')).status).toBe(401);
    }
    const ok = await loginVia(app, user.email, PASSWORD, '192.0.2.30');
    expect(ok.status).toBe(201);
    expect(ok.body.data.accessToken).toEqual(expect.any(String));
    expect((await loginVia(app, user.email, WRONG_PASSWORD, '192.0.2.30')).status).toBe(429);
  });
});

describe('Login throttler without XFF shares the socket-peer bucket [F-27]', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await bootApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('no XFF header falls back to socket peer; those requests share one bucket', async () => {
    const user = await createScratchUser('throttle-e2e-d');
    for (let i = 0; i < LIMIT; i++) {
      expect((await loginVia(app, user.email, WRONG_PASSWORD)).status).toBe(401);
    }
    expect((await loginVia(app, user.email, WRONG_PASSWORD)).status).toBe(429);
  });
});

describe('Multi-hop X-Forwarded-For uses the last trusted hop under the configureApp production trust-proxy hops [F-27]', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await bootApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('varying the spoofed leftmost entry cannot evade the limit', async () => {
    const user = await createScratchUser('throttle-e2e-e');
    for (let i = 1; i <= LIMIT; i++) {
      expect((await loginVia(app, user.email, WRONG_PASSWORD, `198.51.100.${i}, 192.0.2.40`)).status).toBe(401);
    }
    expect((await loginVia(app, user.email, WRONG_PASSWORD, '198.51.100.6, 192.0.2.40')).status).toBe(429);
  });

  it('same leftmost, different rightmost are independent', async () => {
    const user = await createScratchUser('throttle-e2e-f');
    for (let i = 0; i < LIMIT; i++) {
      expect((await loginVia(app, user.email, WRONG_PASSWORD, '198.51.100.9, 192.0.2.41')).status).toBe(401);
    }
    expect((await loginVia(app, user.email, WRONG_PASSWORD, '198.51.100.9, 192.0.2.41')).status).toBe(429);
    expect((await loginVia(app, user.email, WRONG_PASSWORD, '198.51.100.9, 192.0.2.42')).status).toBe(401);
  });
});

describe('Trust proxy disabled control: XFF is ignored [F-27]', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await bootApp(false);
  });
  afterAll(async () => {
    await app.close();
  });

  it('5 different XFFs share the socket-peer bucket; 6th is 429', async () => {
    const user = await createScratchUser('throttle-e2e-g');
    for (let i = 0; i < LIMIT; i++) {
      expect((await loginVia(app, user.email, WRONG_PASSWORD, `192.0.2.${50 + i}`)).status).toBe(401);
    }
    expect((await loginVia(app, user.email, WRONG_PASSWORD, '192.0.2.55')).status).toBe(429);
  });
});

describe('Account lockout does not spread across source IPs [F-27]', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await bootApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('ten failures from ten different IPs lock no one: victim from an eleventh IP still gets 201', async () => {
    const victim = await createScratchUser('throttle-e2e-lock-a');
    const attackerIps = Array.from({ length: 10 }, (_, i) => `203.0.113.${i + 1}`);
    for (const attackerIp of attackerIps) {
      expect((await loginVia(app, victim.email, WRONG_PASSWORD, attackerIp)).status).toBe(401);
    }

    const rows = await prisma.loginAttempt.findMany({ where: { userId: victim.id } });
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.ip).sort()).toEqual([...attackerIps].sort());
    expect(rows.every((r) => r.failedCount === 1 && r.lockoutUntil === null)).toBe(true);

    const victimIp = '203.0.113.11';
    const ok = await loginVia(app, victim.email, PASSWORD, victimIp);
    expect(ok.status).toBe(201);
    expect(ok.body.data.accessToken).toEqual(expect.any(String));
    expect(rows.some((r) => r.ip === victimIp)).toBe(false);
    expect(
      await prisma.loginAttempt.findUnique({ where: { userId_ip: { userId: victim.id, ip: victimIp } } }),
    ).toBeNull();
  });
});
