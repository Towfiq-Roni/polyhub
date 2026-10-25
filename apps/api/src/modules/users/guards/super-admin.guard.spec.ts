import { randomUUID } from 'crypto';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ROLE_NAMES } from '@hub/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { SuperAdminGuard } from './super-admin.guard';

process.env.DATABASE_URL ??= 'postgresql://hub:hub_dev_local_only@localhost:5432/hub_dev';

// Real PrismaService against the dev DB (no mocks); scratch rows only.
describe('SuperAdminGuard [F-28]', () => {
  const prisma = new PrismaService();
  const raw = new PrismaClient();
  const guard = new SuperAdminGuard(prisma);
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];

  const contextFor = (userId: string): ExecutionContext =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user: { id: userId } }) }) }) as unknown as ExecutionContext;

  async function scratchUser(): Promise<string> {
    const user = await raw.user.create({
      data: { email: `guard-spec-${randomUUID()}@example.com`, passwordHash: 'x', name: 'Guard Spec' },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await raw.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
    await raw.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await raw.role.deleteMany({ where: { id: { in: createdRoleIds } } });
    await raw.$disconnect();
    await prisma.$disconnect();
  });

  it('allows a user holding an ACTIVE SUPER_ADMIN role [F-28]', async () => {
    const role = await raw.role.upsert({
      where: { name: ROLE_NAMES.SUPER_ADMIN },
      update: {},
      create: { name: ROLE_NAMES.SUPER_ADMIN },
    });
    expect(role.status).toBe('ACTIVE');
    const userId = await scratchUser();
    await raw.userRole.create({ data: { userId, roleId: role.id } });

    await expect(guard.canActivate(contextFor(userId))).resolves.toBe(true);
  });

  it('rejects a user with no roles with ForbiddenException [F-28]', async () => {
    const userId = await scratchUser();
    await expect(guard.canActivate(contextFor(userId))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a user holding only a different role [F-28]', async () => {
    const role = await raw.role.create({ data: { name: `OTHER_${randomUUID()}` } });
    createdRoleIds.push(role.id);
    const userId = await scratchUser();
    await raw.userRole.create({ data: { userId, roleId: role.id } });

    await expect(guard.canActivate(contextFor(userId))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when the SUPER_ADMIN role row is INACTIVE [F-28]', async () => {
    const role = await raw.role.upsert({
      where: { name: ROLE_NAMES.SUPER_ADMIN },
      update: {},
      create: { name: ROLE_NAMES.SUPER_ADMIN },
    });
    const userId = await scratchUser();
    await raw.userRole.create({ data: { userId, roleId: role.id } });

    await raw.role.update({ where: { id: role.id }, data: { status: 'INACTIVE' } });
    try {
      await expect(guard.canActivate(contextFor(userId))).rejects.toBeInstanceOf(ForbiddenException);
    } finally {
      await raw.role.update({ where: { id: role.id }, data: { status: 'ACTIVE' } });
    }
  });
});
