import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ROLE_NAMES } from '@hub/shared';
import { hashPassword } from '../src/modules/auth/auth.service';

const logger = new Logger('Seed');

export interface SuperAdminCredentials {
  email: string;
  password: string;
}

/**
 * Reads the two required bootstrap env vars. Called first, before any Prisma
 * call — never falls back to a hardcoded default; throws loudly if either is
 * unset so the seed fails fast rather than silently skipping/creating with a
 * bad value.
 */
export function readSuperAdminCredentials(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): SuperAdminCredentials {
  const email = env.SUPER_ADMIN_EMAIL;
  const password = env.SUPER_ADMIN_PASSWORD;

  if (!email) {
    throw new Error('SUPER_ADMIN_EMAIL env var is required to seed the SUPER_ADMIN bootstrap user');
  }
  if (!password) {
    throw new Error('SUPER_ADMIN_PASSWORD env var is required to seed the SUPER_ADMIN bootstrap user');
  }

  return { email, password };
}

/**
 * Idempotent SUPER_ADMIN bootstrap (CLAUDE.md rule #9 — >=1 active
 * SUPER_ADMIN invariant). No-ops if an active SUPER_ADMIN already exists
 * (any email); otherwise creates the Role/User/UserRole triple. Never logs
 * the plaintext password, on success or failure.
 */
export async function seedSuperAdmin(
  prisma: PrismaClient,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): Promise<void> {
  // Env check runs before any Prisma call — deliberately first, not after the
  // idempotency read, so a misconfigured env fails loudly even when this
  // would otherwise have been a no-op.
  const { email, password } = readSuperAdminCredentials(env);

  const existing = await prisma.user.findFirst({
    where: {
      status: 'ACTIVE',
      userRoles: { some: { role: { name: ROLE_NAMES.SUPER_ADMIN } } },
    },
    select: { id: true },
  });

  if (existing) {
    logger.log('SUPER_ADMIN bootstrap: an active SUPER_ADMIN already exists, skipping.');
    return;
  }

  const role = await prisma.role.upsert({
    where: { name: ROLE_NAMES.SUPER_ADMIN },
    update: {},
    create: { name: ROLE_NAMES.SUPER_ADMIN },
  });

  const passwordHash = await hashPassword(password);

  // User + UserRole must both succeed or neither does — a User row with no
  // SUPER_ADMIN join (or vice versa) would violate the invariant this seed
  // exists to guarantee.
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, passwordHash, name: 'Super Admin' },
    });
    await tx.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });
  });

  logger.log(`SUPER_ADMIN bootstrap: created SUPER_ADMIN user (${email}).`);
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seedSuperAdmin(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    logger.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
