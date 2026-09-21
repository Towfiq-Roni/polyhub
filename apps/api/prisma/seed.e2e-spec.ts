import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { ROLE_NAMES } from '@hub/shared';
import { readSuperAdminCredentials, seedSuperAdmin } from './seed';

// Real Postgres, not mocked — this script's whole job is proving idempotent
// upsert/transaction behavior against the actual DB (schema constraints,
// $transaction atomicity), which a mocked PrismaClient can't verify. Mirrors
// test/health.e2e-spec.ts's own DATABASE_URL fallback pattern so this runs
// standalone in CI without an apps/api/.env file present.
process.env.DATABASE_URL ??= 'postgresql://hub:hub_dev_local_only@localhost:5432/hub_dev';

describe('seedSuperAdmin (e2e)', () => {
  const prisma = new PrismaClient();
  const testEmail = `seed-test-${Date.now()}@example.com`;
  const testPassword = 'Test-Passw0rd-42!';

  afterEach(async () => {
    // Clean up only what this test file creates — never touches a
    // pre-existing/real SUPER_ADMIN row seeded outside this test run.
    const user = await prisma.user.findUnique({ where: { email: testEmail } });
    if (user) {
      await prisma.userRole.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('readSuperAdminCredentials', () => {
    it('throws when SUPER_ADMIN_EMAIL is missing', () => {
      expect(() => readSuperAdminCredentials({ SUPER_ADMIN_PASSWORD: 'x' })).toThrow(/SUPER_ADMIN_EMAIL/);
    });

    it('throws when SUPER_ADMIN_PASSWORD is missing', () => {
      expect(() => readSuperAdminCredentials({ SUPER_ADMIN_EMAIL: 'a@b.com' })).toThrow(/SUPER_ADMIN_PASSWORD/);
    });

    it('returns the credentials when both are set', () => {
      expect(readSuperAdminCredentials({ SUPER_ADMIN_EMAIL: 'a@b.com', SUPER_ADMIN_PASSWORD: 'x' })).toEqual({
        email: 'a@b.com',
        password: 'x',
      });
    });
  });

  describe('seedSuperAdmin', () => {
    // Isolate from any pre-existing active SUPER_ADMIN (e.g. the real
    // bootstrap-seeded admin@example.com this same seed script creates in
    // hub-dev-pg for later e2e fixtures) so the "creates a new one" test is
    // deterministic regardless of what's already in the DB. Temporarily
    // deactivates rather than deletes, and always restores in afterEach —
    // never destroys the real fixture row.
    let deactivatedIds: string[] = [];

    beforeEach(async () => {
      const activeSuperAdmins = await prisma.user.findMany({
        where: { status: 'ACTIVE', userRoles: { some: { role: { name: ROLE_NAMES.SUPER_ADMIN } } } },
        select: { id: true },
      });
      deactivatedIds = activeSuperAdmins.map((u) => u.id);
      if (deactivatedIds.length > 0) {
        await prisma.user.updateMany({ where: { id: { in: deactivatedIds } }, data: { status: 'INACTIVE' } });
      }
    });

    afterEach(async () => {
      if (deactivatedIds.length > 0) {
        await prisma.user.updateMany({ where: { id: { in: deactivatedIds } }, data: { status: 'ACTIVE' } });
      }
    });

    it('throws before touching the DB when env vars are missing', async () => {
      // Any property access on this fake PrismaClient throws — proves the env
      // check runs strictly before any Prisma call, not just "before the write".
      const untouchedPrisma = new Proxy(
        {},
        {
          get() {
            throw new Error('DB should not have been touched');
          },
        },
      ) as unknown as PrismaClient;

      await expect(seedSuperAdmin(untouchedPrisma, {})).rejects.toThrow(/SUPER_ADMIN_EMAIL/);
    });

    it('creates exactly one User+Role+UserRole with a real argon2 password round-trip', async () => {
      await seedSuperAdmin(prisma, { SUPER_ADMIN_EMAIL: testEmail, SUPER_ADMIN_PASSWORD: testPassword });

      const user = await prisma.user.findUnique({
        where: { email: testEmail },
        include: { userRoles: { include: { role: true } } },
      });

      expect(user).not.toBeNull();
      expect(user!.status).toBe('ACTIVE');
      expect(user!.userRoles).toHaveLength(1);
      expect(user!.userRoles[0].role.name).toBe(ROLE_NAMES.SUPER_ADMIN);

      // Round-trip proof, not just "a hash exists": the stored hash must
      // actually verify the plaintext password we passed in.
      expect(await argon2.verify(user!.passwordHash, testPassword)).toBe(true);
      expect(await argon2.verify(user!.passwordHash, 'wrong-password')).toBe(false);
    });

    it('is a true no-op the second time — no duplicate rows once an active SUPER_ADMIN exists', async () => {
      await seedSuperAdmin(prisma, { SUPER_ADMIN_EMAIL: testEmail, SUPER_ADMIN_PASSWORD: testPassword });
      // Second call, even with different credentials: an active SUPER_ADMIN
      // already exists, so this must no-op rather than create a second one.
      await seedSuperAdmin(prisma, { SUPER_ADMIN_EMAIL: 'someone-else@example.com', SUPER_ADMIN_PASSWORD: 'other' });

      const matchingUsers = await prisma.user.findMany({ where: { email: testEmail } });
      const otherUsers = await prisma.user.findMany({ where: { email: 'someone-else@example.com' } });

      expect(matchingUsers).toHaveLength(1);
      expect(otherUsers).toHaveLength(0);
    });
  });
});
