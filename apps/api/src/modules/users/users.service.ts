import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ROLE_NAMES } from '@hub/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { hashPassword } from '../auth/auth.service';
import type { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './dto/user-requests.dto';
import type { UserAdminViewDto } from './dto/user-response.dto';

// Explicit select: passwordHash and lockout fields are never loaded for the view.
const userSelect = {
  id: true,
  email: true,
  name: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  userRoles: { select: { role: { select: { name: true } } } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

interface AuditState {
  email: string;
  name: string;
  status: string;
}

const toView = ({ userRoles, ...user }: UserRow): UserAdminViewDto => ({
  ...user,
  roles: userRoles.map((ur) => ur.role.name),
});

const auditState = (u: UserRow): AuditState => ({ email: u.email, name: u.name, status: u.status });

@Injectable()
export class UsersService {
  private readonly auditLogger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  async create(actorId: string, dto: CreateUserDto): Promise<UserAdminViewDto> {
    const passwordHash = await hashPassword(dto.password);
    const created = await this.prisma.user
      .create({ data: { email: dto.email, name: dto.name, passwordHash }, select: userSelect })
      .catch(this.mapUniqueEmail);
    this.audit(actorId, 'user.create', created.id, null, auditState(created));
    return toView(created);
  }

  async list(): Promise<UserAdminViewDto[]> {
    // ponytail: ≤5 users (NFR-SCALE-01) → add ?page&limit&q when user count grows
    const users = await this.prisma.user.findMany({ select: userSelect, orderBy: { createdAt: 'asc' } });
    return users.map(toView);
  }

  async get(id: string): Promise<UserAdminViewDto> {
    return toView(await this.findOrThrow(id));
  }

  async update(actorId: string, id: string, dto: UpdateUserDto): Promise<UserAdminViewDto> {
    if (dto.email === undefined && dto.name === undefined) {
      throw new BadRequestException('At least one field required');
    }
    // ponytail: `before` read outside the tx; concurrent edits can misreport it → #6 AuditLog write
    const before = await this.findOrThrow(id);
    const email = dto.email ?? before.email;
    const name = dto.name ?? before.name;
    if (email === before.email && name === before.name) return toView(before);
    const after = await this.prisma.user
      .update({ where: { id }, data: { email, name }, select: userSelect })
      .catch(this.mapUniqueEmail);
    this.audit(actorId, 'user.update', id, auditState(before), auditState(after));
    return toView(after);
  }

  async deactivate(actorId: string, id: string): Promise<UserAdminViewDto> {
    const before = await this.findOrThrow(id);
    if (before.status === 'INACTIVE') return toView(before);

    const after = await this.prisma.$transaction(async (tx) => {
      await this.assertNotLastActiveSuperAdmin(tx, id);
      const updated = await tx.user.update({ where: { id }, data: { status: 'INACTIVE' }, select: userSelect });
      await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      return updated;
    });
    this.audit(actorId, 'user.deactivate', id, auditState(before), auditState(after));
    return toView(after);
  }

  async activate(actorId: string, id: string): Promise<UserAdminViewDto> {
    const before = await this.findOrThrow(id);
    if (before.status === 'ACTIVE') {
      // Already active: activate doubles as "unlock". No-op (no write, no audit) when nothing is locked.
      const { count } = await this.prisma.loginAttempt.deleteMany({ where: { userId: id } });
      if (count > 0)
        this.audit(actorId, 'user.activate', id, auditState(before), auditState(before), { lockoutCleared: true });
      return toView(before);
    }

    // Stale per-IP rows are harmless once ACTIVE but cleared for hygiene.
    await this.prisma.loginAttempt.deleteMany({ where: { userId: id } });
    const after = await this.prisma.user.update({
      where: { id },
      data: { status: 'ACTIVE' },
      select: userSelect,
    });
    this.audit(actorId, 'user.activate', id, auditState(before), auditState(after));
    return toView(after);
  }

  async resetPassword(actorId: string, id: string, dto: ResetPasswordDto): Promise<UserAdminViewDto> {
    const before = await this.findOrThrow(id);
    const passwordHash = await hashPassword(dto.password);

    const after = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { passwordHash },
        select: userSelect,
      });
      await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.loginAttempt.deleteMany({ where: { userId: id } });
      return updated;
    });
    // before/after carry email/name/status only; never the password or its hash.
    this.audit(actorId, 'user.reset_password', id, auditState(before), auditState(after));
    return toView(after);
  }

  private async findOrThrow(id: string): Promise<UserRow> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private mapUniqueEmail(err: unknown): never {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictException('Email already in use');
    }
    throw err;
  }

  // Rule 9: lock every active SUPER_ADMIN row (ordered by id: no deadlock) so concurrent mutual deactivations serialize.
  private async assertNotLastActiveSuperAdmin(tx: Prisma.TransactionClient, targetId: string): Promise<void> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT u.id FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r ON r.id = ur.role_id
      WHERE u.status = 'ACTIVE' AND r.status = 'ACTIVE' AND r.name = ${ROLE_NAMES.SUPER_ADMIN}
      ORDER BY u.id
      FOR UPDATE OF u`;
    const ids = new Set(locked.map((row) => row.id));
    if (ids.has(targetId) && ids.size === 1) {
      throw new UnprocessableEntityException('Cannot deactivate the last active Super Admin');
    }
  }

  // ponytail: logger line, no AuditLog table yet → #6 replaces this method body with the AuditLog write (and #6 must cover users routes)
  private audit(
    actorId: string,
    action: string,
    entityId: string,
    before: AuditState | null,
    after: AuditState | null,
    extra: { lockoutCleared?: true } = {},
  ): void {
    this.auditLogger.log(JSON.stringify({ actorId, action, entityType: 'User', entityId, before, after, ...extra }));
  }
}
