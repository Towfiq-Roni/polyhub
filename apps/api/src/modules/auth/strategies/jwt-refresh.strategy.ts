import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';

interface JwtPayload {
  sub: string;
  sid: string;
}

/**
 * DEC-078: `sid` (the `Session` row id embedded at sign-time) travels alongside
 * the usual user fields so downstream code (AuthService.refresh/logout,
 * AuthController) can identify exactly which session a refresh request/logout
 * is acting on, without re-decoding the JWT itself.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  status: string;
  sid: string;
}

// Minimal shape instead of importing express's `Request` — this file only
// ever reads `req.cookies.refresh_token`, and apps/api has no direct
// dependency on `express`/`@types/express` (Nest's platform-express brings
// it transitively) so pulling in the full type would need a new dependency
// for a one-field read.
interface RequestWithCookies {
  cookies?: Record<string, string | undefined>;
}

/**
 * Refresh token travels ONLY as the httpOnly `refresh_token` cookie, never a
 * header (ADR-0004) — hence this custom extractor instead of
 * ExtractJwt.fromAuthHeaderAsBearerToken().
 */
export function refreshTokenExtractor(req: RequestWithCookies): string | null {
  return req?.cookies?.refresh_token ?? null;
}

/**
 * Same validate() shape/logic as JwtAccessStrategy, PLUS a Session revocation
 * check (DEC-078) — access tokens stay fully stateless (ADR-0012), refresh
 * tokens do not: a still-unexpired, correctly-signed refresh JWT must still be
 * rejected once its Session row is revoked (logout) or past expiresAt. This is
 * the one enforcement point Gate E10 depends on.
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: refreshTokenExtractor,
      secretOrKey: configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid credentials');
    }

    const session = await this.prisma.session.findUnique({ where: { id: payload.sid } });

    if (
      !session ||
      session.userId !== user.id ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return { id: user.id, email: user.email, name: user.name, status: user.status, sid: session.id };
  }
}
