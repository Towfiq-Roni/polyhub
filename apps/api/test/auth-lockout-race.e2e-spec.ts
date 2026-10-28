import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { http, startApp } from './support/http';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/modules/auth/auth.service';

/*
 * Parallel failed-login counting race (task #52, DEC-115) over HTTP.
 *
 * Runs at the DEFAULT LOCKOUT_MAX_ATTEMPTS (10): 5 parallel requests (the login
 * throttle ceiling per IP) can never reach the threshold, so the assertions are
 * exact and deterministic: failedCount === 5, lockoutUntil null. A read-then-write
 * upsert (findUnique then create/update) loses updates or hits P2002 here.
 *
 * Env isolation: jest gives each test file its own `process.env` copy, so the
 * LOCKOUT_MAX_ATTEMPTS=3 pinned by auth-lockout.e2e-spec.ts cannot leak. This
 * file also deletes the variable before requiring AppModule (ambient shell value
 * must not change the threshold) and restores it in afterAll.
 *
 * Scratch users only (`lockout-race-*@example.com`); the seeded admin is never
 * used. Tests are self-contained (own users, fresh IPs from 192.0.2.101+).
 */

process.env.DATABASE_URL ??= 'postgresql://hub:hub_dev_local_only@localhost:5432/hub_dev';
process.env.JWT_ACCESS_SECRET ??= 'e2e-access-secret-at-least-16-chars';
process.env.JWT_REFRESH_SECRET ??= 'e2e-refresh-secret-at-least-16-chars';
process.env.SUPER_ADMIN_EMAIL ??= 'admin@example.com';
process.env.SUPER_ADMIN_PASSWORD ??= 'e2e-super-admin-password';
process.env.WEB_ORIGIN ??= 'http://localhost:3000';
const previousMax = process.env.LOCKOUT_MAX_ATTEMPTS;
delete process.env.LOCKOUT_MAX_ATTEMPTS;

jest.setTimeout(60_000);

const PASSWORD = 'Correct-Horse-Battery-Staple-9!';
const WRONG_PASSWORD = 'definitely-wrong-password';

const prisma = new PrismaClient();
const createdUserIds: string[] = [];

// Distinct, never-repeating source IP per call (TEST-NET-1 block, 101..250).
let ipCounter = 100;
const ip = (): string => `192.0.2.${++ipCounter}`;

async function createScratchUser(prefix: string): Promise<{ id: string; email: string }> {
  const email = `${prefix}-${randomUUID()}@example.com`;
  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.create({
    data: { email, passwordHash, name: 'Lockout Race Scratch User', status: 'ACTIVE' },
  });
  createdUserIds.push(user.id);
  return { id: user.id, email };
}

describe('Parallel failed-login counting, default threshold [F-27]', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await startApp(app);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
    await app.close();
    if (previousMax === undefined) delete process.env.LOCKOUT_MAX_ATTEMPTS;
    else process.env.LOCKOUT_MAX_ATTEMPTS = previousMax;
  });

  const loginVia = (email: string, password: string, xff: string) =>
    http(app).post('/api/v1/auth/login').set('X-Forwarded-For', xff).send({ email, password });

  const fireParallel = (email: string, from: string, n: number) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    // Barrier: every request is queued on `gate`, then all are issued in one tick.
    const pending = Array.from({ length: n }, () => gate.then(() => loginVia(email, WRONG_PASSWORD, from)));
    release();
    return Promise.all(pending);
  };

  it('L12a parallel failures on the insert path are counted exactly [F-27]', async () => {
    const fresh = await createScratchUser('lockout-race-a');
    const responses = await fireParallel(fresh.email, ip(), 5);
    responses.forEach((res) => expect(res.status).toBe(401));
    const rows = await prisma.loginAttempt.findMany({ where: { userId: fresh.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].failedCount).toBe(5);
    expect(rows[0].lockoutUntil).toBeNull();
  });

  it('L12b parallel failures on the conflict path are counted exactly [F-27]', async () => {
    const seeded = await createScratchUser('lockout-race-b');
    const z = ip();
    await prisma.loginAttempt.create({
      data: { userId: seeded.id, ip: z, failedCount: 1, firstFailedAt: new Date(), updatedAt: new Date() },
    });
    const responses = await fireParallel(seeded.email, z, 4);
    responses.forEach((res) => expect(res.status).toBe(401));
    const row = await prisma.loginAttempt.findUnique({ where: { userId_ip: { userId: seeded.id, ip: z } } });
    expect(row?.failedCount).toBe(5);
    expect(row?.lockoutUntil).toBeNull();
  });
});
