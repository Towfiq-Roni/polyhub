import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ROLE_NAMES } from '@hub/shared';
import { PrismaService } from '../../../prisma/prisma.service';

// ponytail: interim SUPER_ADMIN-only gate (SRS FR-ADMIN-02 is admin-only) → #4 replaces with @RequirePermissions(...) from the packages/shared catalog; delete this guard then
/** Use after JwtAccessGuard: request.user.id must hold an ACTIVE SUPER_ADMIN role. */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const userId = context.switchToHttp().getRequest<{ user?: { id?: string } }>().user?.id;
    if (!userId) throw new ForbiddenException('Forbidden');
    const held = await this.prisma.userRole.findFirst({
      where: { userId, role: { name: ROLE_NAMES.SUPER_ADMIN, status: 'ACTIVE' } },
      select: { userId: true },
    });
    if (!held) throw new ForbiddenException('Forbidden');
    return true;
  }
}
