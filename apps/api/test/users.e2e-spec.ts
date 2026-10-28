import { randomUUID } from 'crypto';
import { INestApplication, Logger, LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { http as httpApp, startApp } from './support/http';
import { ROLE_NAMES } from '@hub/shared';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/modules/auth/auth.service';
import { UsersService } from '../src/modules/users/users.service';

// Env-before-import: AppModule evaluates ConfigModule.forRoot({validate}) at
// decoration time (same constraint as auth.e2e-spec.ts).
process.env.DATABASE_URL ??= 'postgresql://hub:hub_dev_local_only@localhost:5432/hub_dev';
process.env.JWT_ACCESS_SECRET ??= 'e2e-access-secret-at-least-16-chars';
process.env.JWT_REFRESH_SECRET ??= 'e2e-refresh-secret-at-least-16-chars';
process.env.SUPER_ADMIN_EMAIL ??= 'admin@example.com';
process.env.SUPER_ADMIN_PASSWORD ??= 'e2e-super-admin-password';
process.env.WEB_ORIGIN ??= 'http://localhost:3000';

const PASSWORD = 'Correct-Horse-Battery-Staple-9!';
const NEW_PASSWORD = 'New-Temp-Pass-123!';
const SECRET_KEYS = ['passwordHash', 'password', 'lockoutUntil', 'failedLoginAttempts', 'firstFailedAttemptAt'];
const VIEW_KEYS = ['createdAt', 'email', 'id', 'lastLoginAt', 'name', 'roles', 'status', 'updatedAt'];

function hasKeyDeep(value: unknown, key: string): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => hasKeyDeep(item, key));
  const record = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, key)) return true;
  return Object.values(record).some((nested) => hasKeyDeep(nested, key));
}

function expectNoSecrets(body: unknown): void {
  for (const key of SECRET_KEYS) expect(hasKeyDeep(body, key)).toBe(false);
}

function cookiePair(setCookie: string[] | undefined, name: string): string | undefined {
  return setCookie?.find((entry) => entry.startsWith(`${name}=`))?.split(';')[0];
}

describe('Users (e2e) [F-28]', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const createdUserIds: string[] = [];

  interface ScratchUser {
    id: string;
    email: string;
  }

  async function superAdminRoleId(): Promise<string> {
    const role = await prisma.role.upsert({
      where: { name: ROLE_NAMES.SUPER_ADMIN },
      update: {},
      create: { name: ROLE_NAMES.SUPER_ADMIN },
    });
    return role.id;
  }

  async function createScratchUser(
    prefix: string,
    opts: { superAdmin?: boolean; status?: 'ACTIVE' | 'INACTIVE' } = {},
  ): Promise<ScratchUser> {
    const email = `${prefix}-${randomUUID()}@example.com`;
    const passwordHash = await hashPassword(PASSWORD);
    const user = await prisma.user.create({
      data: { email, passwordHash, name: 'Scratch Users E2E', status: opts.status ?? 'ACTIVE' },
    });
    createdUserIds.push(user.id);
    if (opts.superAdmin) {
      await prisma.userRole.create({ data: { userId: user.id, roleId: await superAdminRoleId() } });
    }
    return { id: user.id, email };
  }

  let ipCounter = 0;
  const nextIp = () => {
    ipCounter += 1;
    return `203.0.113.${ipCounter}`; // TEST-NET-3: login throttle is 5/min/IP
  };

  const login = (email: string, password: string = PASSWORD) =>
    httpApp(app).post('/api/v1/auth/login').set('X-Forwarded-For', nextIp()).send({ email, password });

  async function tokenFor(user: ScratchUser): Promise<string> {
    const response = await login(user.email);
    expect([200, 201]).toContain(response.status);
    return response.body.data.accessToken as string;
  }

  const http = (token: string) => ({
    get: (url: string) => httpApp(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) => httpApp(app).post(url).set('Authorization', `Bearer ${token}`),
    patch: (url: string) => httpApp(app).patch(url).set('Authorization', `Bearer ${token}`),
  });

  /**
   * Rule-9 tests need a known SUPER_ADMIN set. Temporarily deactivates every
   * other ACTIVE SUPER_ADMIN user (incl. the seeded one) and always restores
   * exactly those rows, even on failure.
   */
  async function withIsolatedSuperAdmins(keepIds: string[], fn: () => Promise<void>): Promise<void> {
    const others = await prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        id: { notIn: keepIds },
        userRoles: { some: { role: { name: ROLE_NAMES.SUPER_ADMIN, status: 'ACTIVE' } } },
      },
      select: { id: true },
    });
    const otherIds = others.map((u) => u.id);
    await prisma.user.updateMany({ where: { id: { in: otherIds } }, data: { status: 'INACTIVE' } });
    try {
      await fn();
    } finally {
      await prisma.user.updateMany({ where: { id: { in: otherIds } }, data: { status: 'ACTIVE' } });
    }
  }

  const activeSuperAdminCount = () =>
    prisma.user.count({
      where: {
        status: 'ACTIVE',
        userRoles: { some: { role: { name: ROLE_NAMES.SUPER_ADMIN, status: 'ACTIVE' } } },
      },
    });

  let admin: ScratchUser;
  let adminToken: string;

  beforeAll(async () => {
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await startApp(app);

    admin = await createScratchUser('users-e2e-admin', { superAdmin: true });
    adminToken = await tokenFor(admin);
  });

  afterAll(async () => {
    // Never deletes the shared SUPER_ADMIN Role row.
    await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
    await app.close();
  });

  describe('authorization [F-28]', () => {
    const someId = randomUUID();
    const routes: Array<['get' | 'post' | 'patch', string]> = [
      ['post', '/api/v1/users'],
      ['get', '/api/v1/users'],
      ['get', `/api/v1/users/${someId}`],
      ['patch', `/api/v1/users/${someId}`],
      ['post', `/api/v1/users/${someId}/deactivate`],
      ['post', `/api/v1/users/${someId}/activate`],
      ['post', `/api/v1/users/${someId}/reset-password`],
    ];

    it.each(routes)('%s %s without a token is 401 [F-28]', async (method, url) => {
      const response = await httpApp(app)[method](url).send({});
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ error: { statusCode: 401 } });
    });

    it.each(routes)('%s %s as a user with no roles is 403 [F-28]', async (method, url) => {
      const noRole = await createScratchUser('users-e2e-norole');
      const token = await tokenFor(noRole);
      const response = await http(token)[method](url).send({});
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ error: { statusCode: 403 } });
    });

    it('SUPER_ADMIN whose role row is INACTIVE is 403, and success again once restored [F-28]', async () => {
      const roleId = await superAdminRoleId();
      await prisma.role.update({ where: { id: roleId }, data: { status: 'INACTIVE' } });
      try {
        const response = await http(adminToken).get('/api/v1/users');
        expect(response.status).toBe(403);
      } finally {
        await prisma.role.update({ where: { id: roleId }, data: { status: 'ACTIVE' } });
      }
      expect((await http(adminToken).get('/api/v1/users')).status).toBe(200);
    });
  });

  describe('POST /users [F-28]', () => {
    it('creates a user: 201, exact view shape, lowercased email, argon2id hash, can log in [F-28]', async () => {
      const email = `Users-E2E-Create-${randomUUID()}@Example.com`;
      const response = await http(adminToken)
        .post('/api/v1/users')
        .send({ email, name: '  Created User  ', password: NEW_PASSWORD });

      expect(response.status).toBe(201);
      const data = response.body.data;
      createdUserIds.push(data.id);
      expect(Object.keys(data).sort()).toEqual(VIEW_KEYS);
      expect(data).toMatchObject({
        email: email.toLowerCase(),
        name: 'Created User',
        status: 'ACTIVE',
        roles: [],
        lastLoginAt: null,
      });
      expectNoSecrets(response.body);

      const row = await prisma.user.findUniqueOrThrow({ where: { id: data.id } });
      expect(row.passwordHash).toMatch(/^\$argon2id\$/);
      expect(row.passwordHash).not.toContain(NEW_PASSWORD);

      const loginResponse = await login(email.toLowerCase(), NEW_PASSWORD);
      expect([200, 201]).toContain(loginResponse.status);
    });

    const valid = { email: 'valid@example.com', name: 'Valid', password: NEW_PASSWORD };
    it.each([
      ['bad email', { ...valid, email: 'not-an-email' }],
      ['password length 11', { ...valid, password: 'a'.repeat(11) }],
      ['password length 129', { ...valid, password: 'a'.repeat(129) }],
      ['empty name', { ...valid, name: '' }],
      ['missing email', { name: 'Valid', password: NEW_PASSWORD }],
      ['missing name', { email: 'valid@example.com', password: NEW_PASSWORD }],
      ['missing password', { email: 'valid@example.com', name: 'Valid' }],
    ])('rejects %s with 400 and creates nothing [F-28]', async (_label, body) => {
      const before = await prisma.user.count();
      const response = await http(adminToken).post('/api/v1/users').send(body);
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: { statusCode: 400 } });
      expect(await prisma.user.count()).toBe(before);
    });

    it('accepts boundary passwords of length 12 and 128 [F-28]', async () => {
      for (const length of [12, 128]) {
        const response = await http(adminToken)
          .post('/api/v1/users')
          .send({
            email: `users-e2e-len${length}-${randomUUID()}@example.com`,
            name: 'Boundary',
            password: 'p'.repeat(length),
          });
        expect(response.status).toBe(201);
        createdUserIds.push(response.body.data.id);
      }
    });

    it('duplicate email, including a case variant, is 409 [F-28]', async () => {
      const existing = await createScratchUser('users-e2e-dup');
      for (const email of [existing.email, existing.email.toUpperCase()]) {
        const response = await http(adminToken)
          .post('/api/v1/users')
          .send({ email, name: 'Dup', password: NEW_PASSWORD });
        expect(response.status).toBe(409);
        expect(response.body).toMatchObject({ error: { statusCode: 409, message: 'Email already in use' } });
      }
    });

    it('DB safety net: case-variant duplicate email is rejected by users_email_lower_key [F-28]', async () => {
      const existing = await createScratchUser('users-e2e-lower');
      const upper = existing.email.toUpperCase();
      expect(upper).not.toBe(existing.email);

      // Ids tracked up front so afterAll removes them even if the DB wrongly accepts the row.
      const rawId = randomUUID();
      const ormId = randomUUID();
      createdUserIds.push(rawId, ormId);

      // Clone the scratch row (all columns, so future NOT NULL columns cannot break this test), overriding id + email.
      const rawError = await prisma.$executeRaw`
        INSERT INTO users
        SELECT (jsonb_populate_record(NULL::users, to_jsonb(u) || jsonb_build_object('id', ${rawId}::text, 'email', ${upper}::text))).*
        FROM users u WHERE u.id = ${existing.id}`.then(
        () => null,
        (e: unknown) => e,
      );
      expect(rawError).toMatchObject({ code: 'P2010', meta: { code: '23505' } });

      const ormError = await prisma.user
        .create({ data: { id: ormId, email: upper, passwordHash: 'h', name: 'n' } })
        .then(
          () => null,
          (e: unknown) => e,
        );
      expect(ormError).toMatchObject({ code: 'P2002' });

      expect(await prisma.user.count({ where: { email: { equals: existing.email, mode: 'insensitive' } } })).toBe(1);
    });

    it('ignores extra body fields such as status [F-28]', async () => {
      const response = await http(adminToken)
        .post('/api/v1/users')
        .send({
          email: `users-e2e-extra-${randomUUID()}@example.com`,
          name: 'Extra',
          password: NEW_PASSWORD,
          status: 'INACTIVE',
        });
      expect(response.status).toBe(201);
      createdUserIds.push(response.body.data.id);
      expect(response.body.data.status).toBe('ACTIVE');
    });
  });

  describe('GET /users and GET /users/:id [F-28]', () => {
    it('lists users including a new one, with no secret keys anywhere [F-28]', async () => {
      const target = await createScratchUser('users-e2e-list');
      const response = await http(adminToken).get('/api/v1/users');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.map((u: { id: string }) => u.id)).toContain(target.id);
      expectNoSecrets(response.body);
      for (const item of response.body.data) expect(Object.keys(item).sort()).toEqual(VIEW_KEYS);
    });

    it('lists roles as role names for a SUPER_ADMIN user [F-28]', async () => {
      const response = await http(adminToken).get(`/api/v1/users/${admin.id}`);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ id: admin.id, email: admin.email, roles: [ROLE_NAMES.SUPER_ADMIN] });
      expectNoSecrets(response.body);
    });

    it('unknown uuid is 404 "User not found"; malformed id is 400 [F-28]', async () => {
      const missing = await http(adminToken).get(`/api/v1/users/${randomUUID()}`);
      expect(missing.status).toBe(404);
      expect(missing.body).toMatchObject({ error: { statusCode: 404, message: 'User not found' } });

      const malformed = await http(adminToken).get('/api/v1/users/not-a-uuid');
      expect(malformed.status).toBe(400);
    });
  });

  describe('PATCH /users/:id [F-28]', () => {
    it('changes name and email, persisted, no secrets [F-28]', async () => {
      const target = await createScratchUser('users-e2e-patch');
      const newEmail = `Users-E2E-Patched-${randomUUID()}@Example.com`;
      const response = await http(adminToken)
        .patch(`/api/v1/users/${target.id}`)
        .send({ name: 'Renamed', email: newEmail });
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ id: target.id, name: 'Renamed', email: newEmail.toLowerCase() });
      expectNoSecrets(response.body);
      const row = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(row).toMatchObject({ name: 'Renamed', email: newEmail.toLowerCase() });
    });

    it('email already used by another user is 409 and unchanged [F-28]', async () => {
      const a = await createScratchUser('users-e2e-patch-a');
      const b = await createScratchUser('users-e2e-patch-b');
      const response = await http(adminToken).patch(`/api/v1/users/${a.id}`).send({ email: b.email });
      expect(response.status).toBe(409);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).email).toBe(a.email);
    });

    it('empty body is 400; status and password in body never change anything [F-28]', async () => {
      const target = await createScratchUser('users-e2e-patch-guard');
      const before = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });

      for (const body of [{}, { status: 'INACTIVE' }, { password: 'x' }]) {
        const response = await http(adminToken).patch(`/api/v1/users/${target.id}`).send(body);
        expect(response.status).toBe(400);
      }
      const after = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(after.status).toBe('ACTIVE');
      expect(after.passwordHash).toBe(before.passwordHash);
    });

    it('null email/name is 400 and leaves the row unchanged [F-28]', async () => {
      const target = await createScratchUser('users-e2e-patch-null');
      const before = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });

      for (const body of [{ email: null }, { name: null }, { email: null, name: 'ok' }]) {
        const response = await http(adminToken).patch(`/api/v1/users/${target.id}`).send(body);
        expect(response.status).toBe(400);
      }
      const after = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(after.email).toBe(before.email);
      expect(after.name).toBe(before.name);
      expect(after.updatedAt).toEqual(before.updatedAt);
    });

    it('unknown id is 404 [F-28]', async () => {
      const response = await http(adminToken).patch(`/api/v1/users/${randomUUID()}`).send({ name: 'Nobody' });
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { message: 'User not found' } });
    });
  });

  describe('POST /users/:id/deactivate [F-28]', () => {
    it('deactivates and revokes all sessions together; old tokens, refresh and login all fail; other users untouched [F-28]', async () => {
      const target = await createScratchUser('users-e2e-deact');
      const bystander = await createScratchUser('users-e2e-bystander');
      const firstLogin = await login(target.email);
      const secondLogin = await login(target.email);
      const oldAccessToken = firstLogin.body.data.accessToken as string;
      const oldCookie = cookiePair(
        secondLogin.headers['set-cookie'] as unknown as string[] | undefined,
        'refresh_token',
      )!;
      await login(bystander.email);
      expect(await prisma.session.count({ where: { userId: target.id, revokedAt: null } })).toBe(2);

      const response = await http(adminToken).post(`/api/v1/users/${target.id}/deactivate`);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ id: target.id, status: 'INACTIVE' });
      expectNoSecrets(response.body);

      const row = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      const sessions = await prisma.session.findMany({ where: { userId: target.id } });
      expect(row.status).toBe('INACTIVE');
      expect(sessions).toHaveLength(2);
      sessions.forEach((s) => expect(s.revokedAt).not.toBeNull());
      expect(await prisma.session.count({ where: { userId: bystander.id, revokedAt: null } })).toBe(1);

      const me = await httpApp(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${oldAccessToken}`);
      expect(me.status).toBe(401);
      const refresh = await httpApp(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie);
      expect(refresh.status).toBe(401);
    });

    it('login of a deactivated user is the same generic 401 as a wrong password [F-27][F-28]', async () => {
      const target = await createScratchUser('users-e2e-inactive-login', { status: 'INACTIVE' });
      const wrongPassword = await login(target.email, 'definitely-wrong-password');
      const inactive = await login(target.email);
      expect(inactive.status).toBe(401);
      expect(inactive.body).toEqual(wrongPassword.body);
      expect(hasKeyDeep(inactive.body, 'accessToken')).toBe(false);
      expect(inactive.headers['set-cookie']).toBeUndefined();
    });

    it('second deactivate is a 200 no-op; unknown id 404; malformed id 400 [F-28]', async () => {
      const target = await createScratchUser('users-e2e-deact-twice');
      expect((await http(adminToken).post(`/api/v1/users/${target.id}/deactivate`)).status).toBe(200);
      const again = await http(adminToken).post(`/api/v1/users/${target.id}/deactivate`);
      expect(again.status).toBe(200);
      expect(again.body.data.status).toBe('INACTIVE');

      const missingdeactivate = await http(adminToken).post(`/api/v1/users/${randomUUID()}/deactivate`);
      expect(missingdeactivate.status).toBe(404);
      expect(missingdeactivate.body).toMatchObject({ error: { message: 'User not found' } });
      expect((await http(adminToken).post('/api/v1/users/not-a-uuid/deactivate')).status).toBe(400);
    });
  });

  describe('POST /users/:id/activate [F-28]', () => {
    it('reactivates a deactivated user who can log in again [F-28]', async () => {
      const target = await createScratchUser('users-e2e-activate', { status: 'INACTIVE' });
      const response = await http(adminToken).post(`/api/v1/users/${target.id}/activate`);
      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('ACTIVE');
      expectNoSecrets(response.body);
      expect([200, 201]).toContain((await login(target.email)).status);
    });

    it('clears lockout state; already ACTIVE is a 200 no-op; unknown id 404 [F-28]', async () => {
      const target = await createScratchUser('users-e2e-unlock');
      const now = new Date();
      await prisma.loginAttempt.createMany({
        data: ['203.0.113.10', '203.0.113.11'].map((ip) => ({
          userId: target.id,
          ip,
          failedCount: 10,
          firstFailedAt: now,
          lockoutUntil: new Date(now.getTime() + 600_000),
          updatedAt: now,
        })),
      });
      expect(await prisma.loginAttempt.count({ where: { userId: target.id } })).toBe(2);

      const response = await http(adminToken).post(`/api/v1/users/${target.id}/activate`);
      expect(response.status).toBe(200);
      expect(await prisma.loginAttempt.count({ where: { userId: target.id } })).toBe(0);
      expect([200, 201]).toContain((await login(target.email)).status);

      expect((await http(adminToken).post(`/api/v1/users/${target.id}/activate`)).status).toBe(200);
      const missingactivate = await http(adminToken).post(`/api/v1/users/${randomUUID()}/activate`);
      expect(missingactivate.status).toBe(404);
      expect(missingactivate.body).toMatchObject({ error: { message: 'User not found' } });
    });
  });

  describe('POST /users/:id/reset-password [F-28]', () => {
    it('sets a new hash, unlocks, revokes all sessions together; old password dead, new works [F-28]', async () => {
      const target = await createScratchUser('users-e2e-reset');
      const first = await login(target.email);
      await login(target.email);
      const oldCookie = cookiePair(first.headers['set-cookie'] as unknown as string[] | undefined, 'refresh_token')!;
      const now = new Date();
      await prisma.loginAttempt.create({
        data: {
          userId: target.id,
          ip: '203.0.113.12',
          failedCount: 5,
          firstFailedAt: now,
          lockoutUntil: new Date(now.getTime() + 600_000),
          updatedAt: now,
        },
      });
      const before = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });

      const response = await http(adminToken)
        .post(`/api/v1/users/${target.id}/reset-password`)
        .send({ password: NEW_PASSWORD });
      expect(response.status).toBe(200);
      expect(Object.keys(response.body.data).sort()).toEqual(VIEW_KEYS);
      expectNoSecrets(response.body);
      expect(JSON.stringify(response.body)).not.toContain(NEW_PASSWORD);

      const after = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(after.passwordHash).not.toBe(before.passwordHash);
      expect(after.passwordHash).toMatch(/^\$argon2id\$/);
      expect(await prisma.loginAttempt.count({ where: { userId: target.id } })).toBe(0);
      const sessions = await prisma.session.findMany({ where: { userId: target.id } });
      expect(sessions.length).toBeGreaterThanOrEqual(2);
      sessions.forEach((s) => expect(s.revokedAt).not.toBeNull());

      expect((await httpApp(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie)).status).toBe(401);
      expect((await login(target.email, PASSWORD)).status).toBe(401);
      expect([200, 201]).toContain((await login(target.email, NEW_PASSWORD)).status);
    });

    it('short or long password is 400 and the hash is unchanged; unknown id 404 [F-28]', async () => {
      const target = await createScratchUser('users-e2e-reset-bad');
      const before = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      for (const password of ['a'.repeat(11), 'a'.repeat(129)]) {
        const response = await http(adminToken).post(`/api/v1/users/${target.id}/reset-password`).send({ password });
        expect(response.status).toBe(400);
      }
      expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).passwordHash).toBe(
        before.passwordHash,
      );

      const missing = await http(adminToken)
        .post(`/api/v1/users/${randomUUID()}/reset-password`)
        .send({ password: NEW_PASSWORD });
      expect(missing.status).toBe(404);
      expect(missing.body).toMatchObject({ error: { message: 'User not found' } });
    });
  });

  describe('audit log lines [F-28]', () => {
    // Plain capture array, no mocks: records every line the real UsersService logs under the 'Audit' context.
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

    const lines = () => captured.map((l) => JSON.parse(l) as Record<string, any>);

    it('exactly one line per successful mutation with allow-listed payload, never a secret [F-28]', async () => {
      const email = `users-e2e-audit-${randomUUID()}@example.com`;
      const created = await http(adminToken)
        .post('/api/v1/users')
        .send({ email, name: 'Audit One', password: PASSWORD });
      expect(created.status).toBe(201);
      const id = created.body.data.id as string;
      createdUserIds.push(id);
      expect(lines()).toEqual([
        {
          actorId: admin.id,
          action: 'user.create',
          entityType: 'User',
          entityId: id,
          before: null,
          after: { email, name: 'Audit One', status: 'ACTIVE' },
        },
      ]);

      captured.length = 0;
      expect((await http(adminToken).patch(`/api/v1/users/${id}`).send({ name: 'Audit Two' })).status).toBe(200);
      expect(lines()).toEqual([
        {
          actorId: admin.id,
          action: 'user.update',
          entityType: 'User',
          entityId: id,
          before: { email, name: 'Audit One', status: 'ACTIVE' },
          after: { email, name: 'Audit Two', status: 'ACTIVE' },
        },
      ]);

      captured.length = 0;
      expect(
        (await http(adminToken).post(`/api/v1/users/${id}/reset-password`).send({ password: NEW_PASSWORD })).status,
      ).toBe(200);
      expect(lines()).toEqual([
        {
          actorId: admin.id,
          action: 'user.reset_password',
          entityType: 'User',
          entityId: id,
          before: { email, name: 'Audit Two', status: 'ACTIVE' },
          after: { email, name: 'Audit Two', status: 'ACTIVE' },
        },
      ]);

      captured.length = 0;
      expect((await http(adminToken).post(`/api/v1/users/${id}/deactivate`)).status).toBe(200);
      expect(lines()).toEqual([
        {
          actorId: admin.id,
          action: 'user.deactivate',
          entityType: 'User',
          entityId: id,
          before: { email, name: 'Audit Two', status: 'ACTIVE' },
          after: { email, name: 'Audit Two', status: 'INACTIVE' },
        },
      ]);

      captured.length = 0;
      expect((await http(adminToken).post(`/api/v1/users/${id}/activate`)).status).toBe(200);
      expect(lines()).toEqual([
        {
          actorId: admin.id,
          action: 'user.activate',
          entityType: 'User',
          entityId: id,
          before: { email, name: 'Audit Two', status: 'INACTIVE' },
          after: { email, name: 'Audit Two', status: 'ACTIVE' },
        },
      ]);

      // Replay every line seen above plus a fresh full pass: no secret substring anywhere.
      captured.length = 0;
      await http(adminToken).post(`/api/v1/users/${id}/reset-password`).send({ password: NEW_PASSWORD });
      await http(adminToken).post(`/api/v1/users/${id}/deactivate`);
      for (const raw of captured) {
        // The action name user.reset_password legitimately contains "password"; scan everything else.
        const line = JSON.stringify({ ...JSON.parse(raw), action: undefined });
        for (const needle of ['password', 'argon2', 'passwordHash', NEW_PASSWORD, PASSWORD]) {
          expect(line.toLowerCase()).not.toContain(needle.toLowerCase());
        }
      }
      expect(captured).toHaveLength(2);
    });

    it('activate that unlocks emits one line with lockoutCleared: true [F-28]', async () => {
      const target = await createScratchUser('users-e2e-audit-unlock');
      await prisma.loginAttempt.create({
        data: {
          userId: target.id,
          ip: '203.0.113.13',
          failedCount: 3,
          firstFailedAt: new Date(),
          lockoutUntil: new Date(Date.now() + 600_000),
          updatedAt: new Date(),
        },
      });
      expect((await http(adminToken).post(`/api/v1/users/${target.id}/activate`)).status).toBe(200);
      const out = lines();
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ action: 'user.activate', entityId: target.id, lockoutCleared: true });
    });

    it('no line for 4xx, no-op deactivate, no-op activate, no-op PATCH (and no DB write for the PATCH) [F-28]', async () => {
      const target = await createScratchUser('users-e2e-audit-noop');
      const other = await createScratchUser('users-e2e-audit-noop-other');

      expect(
        (await http(adminToken).post('/api/v1/users').send({ email: 'bad', name: '', password: 'x' })).status,
      ).toBe(400);
      expect(
        (await http(adminToken).post('/api/v1/users').send({ email: target.email, name: 'Dup', password: PASSWORD }))
          .status,
      ).toBe(409);
      expect((await http(adminToken).patch(`/api/v1/users/${target.id}`).send({ email: other.email })).status).toBe(
        409,
      );
      expect((await http(adminToken).patch(`/api/v1/users/${randomUUID()}`).send({ name: 'x' })).status).toBe(404);
      expect((await http(adminToken).post(`/api/v1/users/${randomUUID()}/deactivate`)).status).toBe(404);
      expect(
        (await http(adminToken).post(`/api/v1/users/${target.id}/reset-password`).send({ password: 'short' })).status,
      ).toBe(400);
      expect(captured).toEqual([]);

      // no-op activate: ACTIVE and unlocked
      expect((await http(adminToken).post(`/api/v1/users/${target.id}/activate`)).status).toBe(200);
      expect(captured).toEqual([]);

      // no-op PATCH: same values, 200 with current view, no write
      const row = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      const noop = await http(adminToken)
        .patch(`/api/v1/users/${target.id}`)
        .send({ email: row.email, name: row.name });
      expect(noop.status).toBe(200);
      expect(noop.body.data).toMatchObject({ id: target.id, email: row.email, name: row.name });
      expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).updatedAt).toEqual(row.updatedAt);
      expect(captured).toEqual([]);

      // no-op deactivate: already INACTIVE
      expect((await http(adminToken).post(`/api/v1/users/${target.id}/deactivate`)).status).toBe(200);
      expect(captured).toHaveLength(1);
      captured.length = 0;
      expect((await http(adminToken).post(`/api/v1/users/${target.id}/deactivate`)).status).toBe(200);
      expect(captured).toEqual([]);

      // last-admin 422 emits nothing
      const lone = await createScratchUser('users-e2e-audit-lone', { superAdmin: true });
      const loneToken = await tokenFor(lone);
      await withIsolatedSuperAdmins([lone.id], async () => {
        expect((await http(loneToken).post(`/api/v1/users/${lone.id}/deactivate`)).status).toBe(422);
      });
      expect(captured).toEqual([]);
    });
  });

  describe('reset-password on INACTIVE target and self-actions [F-28]', () => {
    it('resets an INACTIVE user: stays INACTIVE, hash changes, sessions revoked, login 401 until activate [F-28]', async () => {
      const target = await createScratchUser('users-e2e-reset-inactive');
      const first = await login(target.email);
      const oldCookie = cookiePair(first.headers['set-cookie'] as unknown as string[] | undefined, 'refresh_token')!;
      expect((await http(adminToken).post(`/api/v1/users/${target.id}/deactivate`)).status).toBe(200);
      const before = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });

      const response = await http(adminToken)
        .post(`/api/v1/users/${target.id}/reset-password`)
        .send({ password: NEW_PASSWORD });
      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('INACTIVE');
      const after = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(after.status).toBe('INACTIVE');
      expect(after.passwordHash).not.toBe(before.passwordHash);
      expect(after.passwordHash).toMatch(/^\$argon2id\$/);
      (await prisma.session.findMany({ where: { userId: target.id } })).forEach((s) =>
        expect(s.revokedAt).not.toBeNull(),
      );
      expect((await httpApp(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie)).status).toBe(401);

      const generic = await login(target.email, NEW_PASSWORD);
      expect(generic.status).toBe(401);
      const wrong = await login(target.email, 'definitely-wrong-password');
      expect(generic.body).toEqual(wrong.body);

      expect((await http(adminToken).post(`/api/v1/users/${target.id}/activate`)).status).toBe(200);
      expect([200, 201]).toContain((await login(target.email, NEW_PASSWORD)).status);
    });

    it('SUPER_ADMIN resets its OWN password: sessions revoked, old cookie 401, new password works [F-28]', async () => {
      const self = await createScratchUser('users-e2e-self-reset', { superAdmin: true });
      const loginRes = await login(self.email);
      const token = loginRes.body.data.accessToken as string;
      const oldCookie = cookiePair(loginRes.headers['set-cookie'] as unknown as string[] | undefined, 'refresh_token')!;
      const response = await http(token)
        .post(`/api/v1/users/${self.id}/reset-password`)
        .send({ password: NEW_PASSWORD });
      expect(response.status).toBe(200);
      (await prisma.session.findMany({ where: { userId: self.id } })).forEach((s) =>
        expect(s.revokedAt).not.toBeNull(),
      );
      expect((await httpApp(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie)).status).toBe(401);
      expect((await login(self.email, PASSWORD)).status).toBe(401);
      expect([200, 201]).toContain((await login(self.email, NEW_PASSWORD)).status);
    });

    it('seeded admin can reset its own password and the original is restored [F-28]', async () => {
      const seedEmail = process.env.SUPER_ADMIN_EMAIL!;
      const seedPassword = process.env.SUPER_ADMIN_PASSWORD!;
      const seeded = await prisma.user.findUnique({ where: { email: seedEmail.toLowerCase() } });
      if (!seeded) return; // ponytail: e2e DB without seeded admin → skip, scratch-admin test above covers the path
      const first = await login(seedEmail, seedPassword);
      expect([200, 201]).toContain(first.status);
      const token = first.body.data.accessToken as string;
      const oldCookie = cookiePair(first.headers['set-cookie'] as unknown as string[] | undefined, 'refresh_token')!;
      let restored = false;
      try {
        expect(
          (await http(token).post(`/api/v1/users/${seeded.id}/reset-password`).send({ password: NEW_PASSWORD })).status,
        ).toBe(200);
        expect((await httpApp(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie)).status).toBe(401);
        const second = await login(seedEmail, NEW_PASSWORD);
        expect([200, 201]).toContain(second.status);
        const token2 = second.body.data.accessToken as string;
        expect(
          (await http(token2).post(`/api/v1/users/${seeded.id}/reset-password`).send({ password: seedPassword }))
            .status,
        ).toBe(200);
        restored = true;
      } finally {
        if (!restored) {
          await prisma.user.update({
            where: { id: seeded.id },
            data: { passwordHash: await hashPassword(seedPassword) },
          });
        }
      }
      expect([200, 201]).toContain((await login(seedEmail, seedPassword)).status);
    });

    it('SUPER_ADMIN can deactivate ITSELF when another ACTIVE SUPER_ADMIN exists; old token 401 [F-28]', async () => {
      const a = await createScratchUser('users-e2e-self-deact-a', { superAdmin: true });
      const b = await createScratchUser('users-e2e-self-deact-b', { superAdmin: true });
      const tokenA = await tokenFor(a);
      await withIsolatedSuperAdmins([a.id, b.id], async () => {
        const response = await http(tokenA).post(`/api/v1/users/${a.id}/deactivate`);
        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('INACTIVE');
        expect((await http(tokenA).get('/api/v1/users')).status).toBe(401);
        expect(await activeSuperAdminCount()).toBe(1);
        await prisma.user.update({ where: { id: a.id }, data: { status: 'ACTIVE' } });
        expect(await activeSuperAdminCount()).toBe(2);
      });
    });
  });

  describe('rule 9: last active SUPER_ADMIN invariant [F-28]', () => {
    it('lone active SUPER_ADMIN deactivation is 422 with no partial write [F-28]', async () => {
      const lone = await createScratchUser('users-e2e-lone', { superAdmin: true });
      const loneToken = await tokenFor(lone);
      await withIsolatedSuperAdmins([lone.id], async () => {
        const response = await http(loneToken).post(`/api/v1/users/${lone.id}/deactivate`);
        expect(response.status).toBe(422);
        expect(response.body).toMatchObject({
          error: { statusCode: 422, message: 'Cannot deactivate the last active Super Admin' },
        });
        const row = await prisma.user.findUniqueOrThrow({ where: { id: lone.id } });
        expect(row.status).toBe('ACTIVE');
        expect(await prisma.session.count({ where: { userId: lone.id, revokedAt: null } })).toBe(1);
        expect(await activeSuperAdminCount()).toBe(1);
      });
    });

    it('two SUPER_ADMINs: first deactivation 200, remaining one 422; non-SUPER_ADMIN never blocked [F-28]', async () => {
      const a = await createScratchUser('users-e2e-sa-a', { superAdmin: true });
      const b = await createScratchUser('users-e2e-sa-b', { superAdmin: true });
      const plain = await createScratchUser('users-e2e-sa-plain');
      const tokenA = await tokenFor(a);
      await withIsolatedSuperAdmins([a.id, b.id], async () => {
        expect((await http(tokenA).post(`/api/v1/users/${plain.id}/deactivate`)).status).toBe(200);
        expect((await http(tokenA).post(`/api/v1/users/${b.id}/deactivate`)).status).toBe(200);
        expect(await activeSuperAdminCount()).toBe(1);
        const last = await http(tokenA).post(`/api/v1/users/${a.id}/deactivate`);
        expect(last.status).toBe(422);
        expect(await activeSuperAdminCount()).toBe(1);
      });
    });

    it('concurrent mutual deactivation never leaves zero active SUPER_ADMINs, x3 [F-28]', async () => {
      const a = await createScratchUser('users-e2e-race-a', { superAdmin: true });
      const b = await createScratchUser('users-e2e-race-b', { superAdmin: true });
      const tokenA = await tokenFor(a);
      const tokenB = await tokenFor(b);
      await withIsolatedSuperAdmins([a.id, b.id], async () => {
        for (let round = 0; round < 3; round += 1) {
          const [first, second] = await Promise.all([
            http(tokenA).post(`/api/v1/users/${b.id}/deactivate`),
            http(tokenB).post(`/api/v1/users/${a.id}/deactivate`),
          ]);
          const statuses = [first.status, second.status];
          // The loser is 422 (row-lock serialized) or 401 (winner's commit landed
          // before the loser's JWT strategy ran); never a second 200.
          expect(statuses.filter((s) => s === 200)).toHaveLength(1);
          expect(statuses.filter((s) => s === 422 || s === 401)).toHaveLength(1);
          expect(await activeSuperAdminCount()).toBe(1);

          // Re-arm for the next round: fresh sessions are not needed because the
          // access JWTs stay valid once both users are ACTIVE again.
          await prisma.user.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { status: 'ACTIVE' } });
          expect(await activeSuperAdminCount()).toBe(2);
        }
      });
    });

    it('deterministic lock path: concurrent UsersService.deactivate of two SUPER_ADMINs, x3 [F-28]', async () => {
      const a = await createScratchUser('users-e2e-lock-a', { superAdmin: true });
      const b = await createScratchUser('users-e2e-lock-b', { superAdmin: true });
      const service = app.get(UsersService);
      await withIsolatedSuperAdmins([a.id, b.id], async () => {
        for (let round = 0; round < 3; round += 1) {
          // Direct service calls bypass guards, so the 401-loser branch cannot satisfy this vacuously.
          const results = await Promise.allSettled([
            service.deactivate(admin.id, a.id),
            service.deactivate(admin.id, b.id),
          ]);
          expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
          const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
          expect(rejected).toHaveLength(1);
          expect(rejected[0].reason).toMatchObject({ message: 'Cannot deactivate the last active Super Admin' });
          expect(rejected[0].reason.getStatus()).toBe(422);
          expect(await activeSuperAdminCount()).toBe(1);
          await prisma.user.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { status: 'ACTIVE' } });
          expect(await activeSuperAdminCount()).toBe(2);
        }
      });
    });
  });

  describe('email case-insensitivity [F-28]', () => {
    const countInsensitive = (email: string) =>
      prisma.user.count({ where: { email: { equals: email, mode: 'insensitive' } } });

    it('POST with the same email in other case or padded is 409 and creates no second row [F-28]', async () => {
      const base = `users-e2e-case-${randomUUID()}@example.com`;
      const first = await http(adminToken)
        .post('/api/v1/users')
        .send({ email: base, name: 'Case Base', password: NEW_PASSWORD });
      expect(first.status).toBe(201);
      createdUserIds.push(first.body.data.id);

      for (const typed of [base.toUpperCase(), `  ${base}  `]) {
        const response = await http(adminToken)
          .post('/api/v1/users')
          .send({ email: typed, name: 'Case Dup', password: NEW_PASSWORD });
        // Track any (regressed) 201 so a leaked duplicate row is still cleaned up.
        if (response.status === 201) createdUserIds.push(response.body.data.id);
        expect(response.status).toBe(409);
        expect(response.body).toMatchObject({ error: { statusCode: 409, message: 'Email already in use' } });
      }
      expect(await countInsensitive(base)).toBe(1);
    });

    it('PATCH to another user email in different case is 409 and leaves the row unchanged [F-28]', async () => {
      const a = await createScratchUser('users-e2e-case-a');
      const b = await createScratchUser('users-e2e-case-b');

      const response = await http(adminToken).patch(`/api/v1/users/${b.id}`).send({ email: a.email.toUpperCase() });
      expect(response.status).toBe(409);

      const row = await prisma.user.findUniqueOrThrow({ where: { id: b.id } });
      expect(row.email).toBe(b.email);
    });

    it('user created with a mixed-case email can log in with a differently-cased or padded variant [F-28]', async () => {
      const email = `Users-E2E-Mixed-${randomUUID()}@Example.com`;
      const created = await http(adminToken)
        .post('/api/v1/users')
        .send({ email, name: 'Mixed Case', password: NEW_PASSWORD });
      expect(created.status).toBe(201);
      createdUserIds.push(created.body.data.id);

      for (const typed of [email.toUpperCase(), `  ${email.toLowerCase()}  `]) {
        const response = await login(typed, NEW_PASSWORD);
        expect([200, 201]).toContain(response.status);
        expect(response.body).toMatchObject({ data: { user: { email: email.toLowerCase() } } });
      }
    });
  });
});
