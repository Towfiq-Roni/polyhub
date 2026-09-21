import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';

interface UserWithRoles {
  id: string;
  email: string;
  name: string;
  status: string;
  userRoles: { role: { name: string } }[];
}

interface FailedAttemptState {
  id: string;
}

export interface AuthUserView {
  id: string;
  email: string;
  name: string;
  status: string;
  roles: string[];
}

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface RefreshCookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  path: string;
}

/** Cookie name for the refresh token, shared by the controller's set/clear calls. */
export const REFRESH_COOKIE_NAME = 'refresh_token';

/**
 * Design Decision #1 (build spec): httpOnly, sameSite=lax, path scoped to the
 * auth routes, `secure` only in prod (env-gated). A pure function (not a
 * service method) so the controller can build the options without needing
 * AuthService's Prisma/Jwt dependencies — it only needs the one boolean.
 */
export function buildRefreshCookieOptions(cookieSecure: boolean): RefreshCookieOptions {
  return { httpOnly: true, secure: cookieSecure, sameSite: 'lax', path: '/api/v1/auth' };
}

/**
 * Design Decision #4 (build spec): every login failure — unknown email, wrong
 * password, or a currently-locked account — returns this exact same message
 * and status. We chose a single generic 401 for ALL three cases (rather than
 * 423 for "locked") because issuing a different status specifically for the
 * locked case would itself leak "this email exists and is locked" to an
 * unauthenticated caller — the simplest reading of "do not leak which
 * reason" is to make locked indistinguishable from wrong-password too.
 */
const INVALID_CREDENTIALS = 'Invalid credentials';

/**
 * Owned by this file per the build spec (Batch 10, Design Decision #4's
 * hashing note). `hashPassword` isn't called anywhere in this batch (no
 * password-creation path exists yet — that's the seed script, Batch 11) but
 * lives here so the one place that knows "we hash with argon2id" doesn't
 * get duplicated when that batch lands.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(email: string, password: string): Promise<AuthTokenPair & { user: AuthUserView }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (user.lockoutUntil && user.lockoutUntil.getTime() > Date.now()) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const passwordValid = await verifyPassword(user.passwordHash, password);

    if (!passwordValid) {
      await this.recordFailedAttempt(user);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        firstFailedAttemptAt: null,
        lockoutUntil: null,
        lastLoginAt: new Date(),
      },
    });

    // DEC-078: one Session row per login. Its id is pre-generated (rather than
    // left to Prisma's @default(uuid())) so it can be embedded as the refresh
    // JWT's `sid` claim in the same signing call below — no second write to
    // patch the id in afterward.
    const sessionId = randomUUID();
    const [accessToken, refreshToken] = await Promise.all([
      this.signAccessToken(user.id),
      this.signRefreshToken(user.id, sessionId),
    ]);

    await this.prisma.session.create({
      data: { id: sessionId, userId: user.id, expiresAt: this.decodeExpiry(refreshToken) },
    });

    return { accessToken, refreshToken, user: this.toUserView(user) };
  }

  /**
   * `JwtRefreshStrategy.validate()` already re-checks `status === 'ACTIVE'` and
   * Session validity (missing/revoked/expired, DEC-078) before this method is
   * ever reached (it runs inside the guard, upstream of the controller).
   * Re-checking here is deliberate defense-in-depth: this method has real side
   * effects (issuing fresh tokens, extending the session) and must stay
   * correct even if called from anywhere other than behind that one guard in
   * future.
   *
   * Design choice (build spec Design Decision #2, either option acceptable):
   * rotate the SAME Session row's `expiresAt` forward rather than revoke it and
   * create a new row. Simpler (YAGNI) — no old-row cleanup/accumulation, no
   * extra revoke-then-create round trip — and the `sid` a client already holds
   * keeps meaning the same session across a refresh, which is what "sliding
   * session" refresh is supposed to do.
   */
  async refresh(userId: string, sid: string): Promise<AuthTokenPair> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const session = await this.prisma.session.findUnique({ where: { id: sid } });

    if (
      !session ||
      session.userId !== userId ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.signAccessToken(user.id),
      this.signRefreshToken(user.id, sid),
    ]);

    await this.prisma.session.update({
      where: { id: sid },
      data: { expiresAt: this.decodeExpiry(refreshToken) },
    });

    return { accessToken, refreshToken };
  }

  /**
   * DEC-078: revokes exactly the one Session row identified by `sid` — the
   * session tied to the refresh cookie being used to log out. Every other
   * session row (other devices/logins) for this or any other user is
   * untouched; that is what makes this per-device, not a global logout.
   */
  async logout(sid: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sid },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string): Promise<AuthUserView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    return this.toUserView(user);
  }

  /**
   * Design Decision #3 (build spec), implemented as ONE atomic UPDATE:
   * reset the window when there's no prior failed attempt or the last one
   * aged out of LOCKOUT_WINDOW_MINUTES; otherwise increment. Trip
   * lockoutUntil the moment the (possibly just-reset) count reaches
   * LOCKOUT_MAX_ATTEMPTS.
   *
   * This used to be read-then-decide-in-JS-then-write (a separate
   * `findUnique` in `login()` above, then a computed `prisma.user.update`
   * here) — a classic lost-update race: N concurrent failed logins on the
   * same account all read the same starting count, so all N writes clobber
   * each other and only the last one lands (confirmed empirically: 5
   * parallel wrong-password attempts left failedLoginAttempts=1, not 5).
   *
   * Fixed by moving the whole reset-vs-increment decision AND the
   * lockoutUntil computation into the SQL statement itself, via CASE
   * expressions that read the row's current committed values at write time.
   * Postgres holds this row's write lock for the statement's duration, so
   * concurrent UPDATEs on the same user id serialize on the row instead of
   * racing in application memory — there is no read-then-write gap left to
   * race in. `$executeRaw`'s tagged-template interpolation parameterizes
   * every value (windowMinutes, maxAttempts, user.id); nothing here is
   * string-concatenated.
   */
  private async recordFailedAttempt(user: FailedAttemptState): Promise<void> {
    const maxAttempts = this.configService.getOrThrow<number>('LOCKOUT_MAX_ATTEMPTS');
    const windowMinutes = this.configService.getOrThrow<number>('LOCKOUT_WINDOW_MINUTES');

    await this.prisma.$executeRaw`
      UPDATE users
      SET
        failed_login_attempts = CASE
          WHEN first_failed_attempt_at IS NULL
            OR first_failed_attempt_at < now() - (${windowMinutes} * interval '1 minute')
            THEN 1
          ELSE failed_login_attempts + 1
        END,
        first_failed_attempt_at = CASE
          WHEN first_failed_attempt_at IS NULL
            OR first_failed_attempt_at < now() - (${windowMinutes} * interval '1 minute')
            THEN now()
          ELSE first_failed_attempt_at
        END,
        lockout_until = CASE
          WHEN (
            CASE
              WHEN first_failed_attempt_at IS NULL
                OR first_failed_attempt_at < now() - (${windowMinutes} * interval '1 minute')
                THEN 1
              ELSE failed_login_attempts + 1
            END
          ) >= ${maxAttempts}
            THEN now() + (${windowMinutes} * interval '1 minute')
          ELSE NULL
        END,
        updated_at = now()
      WHERE id = ${user.id}
    `;
  }

  private toUserView(user: UserWithRoles): AuthUserView {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      roles: user.userRoles.map((userRole) => userRole.role.name),
    };
  }

  private async signAccessToken(userId: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId },
      {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        // env.validation.ts validates this as a plain string (e.g. '1d'), which
        // `jsonwebtoken`'s own runtime parsing (via `ms`) accepts fine; its TS
        // type is a narrow template-literal union `ms` can't infer from a
        // dynamic string, hence the cast.
        expiresIn: this.configService.getOrThrow<string>('JWT_ACCESS_TTL') as JwtSignOptions['expiresIn'],
      },
    );
  }

  private async signRefreshToken(userId: string, sid: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId, sid },
      {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.getOrThrow<string>('JWT_REFRESH_TTL') as JwtSignOptions['expiresIn'],
      },
    );
  }

  /**
   * DEC-078: a Session row's `expiresAt` must match the refresh JWT's real
   * `exp` claim. Rather than re-parsing `JWT_REFRESH_TTL` ("7d") with a new
   * duration-parsing dependency, this decodes the token this service *just
   * signed* — reusing the exact TTL parsing `JwtService.signAsync` (via
   * `jsonwebtoken`/`ms`) already did, once, as the source of truth.
   */
  private decodeExpiry(token: string): Date {
    const payload = this.jwtService.decode(token) as { exp: number };
    return new Date(payload.exp * 1000);
  }
}
