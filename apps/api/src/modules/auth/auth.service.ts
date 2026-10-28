import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { isIPv6 } from 'node:net';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { normalizeEmail } from '@hub/shared';
import { PrismaService } from '../../prisma/prisma.service';

interface UserWithRoles {
  id: string;
  email: string;
  name: string;
  status: string;
  userRoles: { role: { name: string } }[];
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
 * DEC-115: the failed-attempt/lockout key is (user, client IP). Callers pass
 * Express `req.ip` (trust proxy 1) only, never X-Forwarded-For. Lowercases,
 * strips the IPv4-mapped prefix and any zone id. IPv6 is keyed on its /64
 * (first 4 hextets, `a:b:c:d::/64`, #56/DEC-118); IPv4/junk keep the exact
 * value capped at 45; a missing IP falls into one shared 'unknown' bucket
 * (fail-closed).
 * ponytail: hex-form IPv4-mapped (::ffff:7f00:1) is not unwrapped; the ^::ffff:
 * strip leaves the stable junk key `7f00:1` (harmless, still one key per
 * client) -> unwrap if a proxy ever emits it.
 */
export function normalizeClientIp(ip?: string): string {
  if (!ip) return 'unknown';
  const v = ip
    .toLowerCase()
    .replace(/^::ffff:/, '')
    .split('%')[0];
  if (!isIPv6(v)) return v.slice(0, 45);
  // Embedded IPv4 tail (a.b.c.d) is two hextets; swap for 0:0 (only the first 4 hextets are keyed).
  const [head, tail = ''] = v.replace(/\d+\.\d+\.\d+\.\d+$/, '0:0').split('::');
  const groups = (part: string) => part.split(':').filter(Boolean);
  const h = groups(head);
  const t = groups(tail);
  const hextets = v.includes('::') ? [...h, ...Array<string>(8 - h.length - t.length).fill('0'), ...t] : h;
  return `${hextets
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(':')}::/64`;
}

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

/** #56/DEC-118: lazy memoized hash (same params as real hashes) for the timing-equaliser verify. */
let dummyHash: Promise<string> | undefined;
const getDummyHash = (): Promise<string> => (dummyHash ??= hashPassword('timing-equaliser-not-a-credential'));

@Injectable()
export class AuthService {
  private readonly auditLogger = new Logger('Audit');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(email: string, password: string, clientIp?: string): Promise<AuthTokenPair & { user: AuthUserView }> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user || user.status !== 'ACTIVE') {
      // #56/DEC-118: equalise latency with the wrong-password path (no email-enumeration timing oracle).
      // ponytail: the locked path (lock check before verify) stays fast -> only reveals "real email AND this IP locked" to the locker; equalise if that ever matters.
      // A failed hash must not 500 or stay memoized: reset so the next call retries.
      await getDummyHash()
        .then((h) => verifyPassword(h, password))
        .catch(() => {
          dummyHash = undefined;
        });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const ip = normalizeClientIp(clientIp);
    const attempt = await this.prisma.loginAttempt.findUnique({
      where: { userId_ip: { userId: user.id, ip } },
    });

    if (attempt?.lockoutUntil && attempt.lockoutUntil.getTime() > Date.now()) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const passwordValid = await verifyPassword(user.passwordHash, password);

    if (!passwordValid) {
      await this.recordFailedAttempt(user.id, ip);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    await this.prisma.loginAttempt.deleteMany({ where: { userId: user.id, ip } });
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
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
   * Design Decision #3 / DEC-115: failed attempts are tracked per (user, client
   * IP) in `login_attempts`, as ONE atomic INSERT .. ON CONFLICT DO UPDATE ..
   * RETURNING: reset the window when the first failure aged out of
   * LOCKOUT_WINDOW_MINUTES, otherwise increment; trip lockout_until the moment
   * the (possibly just-reset) count reaches LOCKOUT_MAX_ATTEMPTS.
   *
   * The decision lives in SQL, not in JS, on purpose (DEC-079): a
   * read-then-write counter loses updates under concurrent failures (5
   * parallel wrong passwords once left the count at 1). Postgres serializes
   * concurrent upserts on the (user_id, ip) key, and the insert branch covers
   * the first-failure race. Tagged `$queryRaw` parameterizes every value;
   * nothing is string-concatenated. `updated_at` is set explicitly (no
   * @updatedAt on this model).
   */
  private async recordFailedAttempt(userId: string, ip: string): Promise<void> {
    const maxAttempts = this.configService.getOrThrow<number>('LOCKOUT_MAX_ATTEMPTS');
    const windowMinutes = this.configService.getOrThrow<number>('LOCKOUT_WINDOW_MINUTES');

    const rows = await this.prisma.$queryRaw<{ failed_count: number }[]>`
      INSERT INTO login_attempts (user_id, ip, failed_count, first_failed_at, lockout_until, updated_at)
      VALUES (
        ${userId}, ${ip}, 1, now(),
        CASE WHEN 1 >= ${maxAttempts}::int THEN now() + (${windowMinutes}::int * interval '1 minute') END,
        now()
      )
      ON CONFLICT (user_id, ip) DO UPDATE SET
        failed_count = CASE
          WHEN login_attempts.first_failed_at < now() - (${windowMinutes}::int * interval '1 minute')
            THEN 1
          ELSE login_attempts.failed_count + 1
        END,
        first_failed_at = CASE
          WHEN login_attempts.first_failed_at < now() - (${windowMinutes}::int * interval '1 minute')
            THEN now()
          ELSE login_attempts.first_failed_at
        END,
        lockout_until = CASE
          WHEN (
            CASE
              WHEN login_attempts.first_failed_at < now() - (${windowMinutes}::int * interval '1 minute')
                THEN 1
              ELSE login_attempts.failed_count + 1
            END
          ) >= ${maxAttempts}::int
            THEN now() + (${windowMinutes}::int * interval '1 minute')
          ELSE NULL
        END,
        updated_at = now()
      RETURNING failed_count, lockout_until
    `;

    if (rows[0]?.failed_count === maxAttempts) {
      // ponytail: logger line, #6 replaces with AuditLog write (same marker as users.service)
      this.auditLogger.log(
        JSON.stringify({ actorId: null, action: 'auth.lockout', entityType: 'User', entityId: userId, ip }),
      );
    }

    // Sweeps ALL users' dead rows (#56/DEC-118; expired window, or lock already over).
    // ponytail: runs only when someone fails -> add a timer only if row count ever matters.
    const now = new Date();
    await this.prisma.loginAttempt.deleteMany({
      where: {
        firstFailedAt: { lt: new Date(now.getTime() - windowMinutes * 60_000) },
        OR: [{ lockoutUntil: null }, { lockoutUntil: { lte: now } }],
      },
    });
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
