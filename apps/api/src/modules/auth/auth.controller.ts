import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService, buildRefreshCookieOptions, REFRESH_COOKIE_NAME, type RefreshCookieOptions } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto, RefreshResponseDto, UserViewDto } from './dto/auth-response.dto';
import { ErrorResponseDto, ValidationErrorResponseDto } from '../../common/dto/error-response.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAccessGuard } from './guards/jwt-access.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';

interface CurrentUserId {
  id: string;
}

// DEC-078: refresh/logout are authenticated via the refresh cookie (not the
// access token) because their whole job is to act on that cookie's Session —
// JwtRefreshStrategy.validate() returns this richer shape (see its own
// AuthenticatedUser type), `sid` identifies exactly which Session row.
interface CurrentSessionUser extends CurrentUserId {
  sid: string;
}

// Minimal shape of what this controller needs from the response object —
// avoids a direct dependency on @types/express (not a declared/hoisted dep
// here; @nestjs/platform-express is the declared express integration). Same
// pattern already used by http-exception.filter.ts and jwt-refresh.strategy.ts.
interface MinimalResponse {
  cookie(name: string, value: string, options: RefreshCookieOptions): void;
  clearCookie(name: string, options: Pick<RefreshCookieOptions, 'path'>): void;
  status(code: number): { send(): void };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  // Scoped to this route only (not a global APP_GUARD) — defense-in-depth
  // alongside nginx's own 5 r/min limit on this same route
  // (analysis/deployment-plan.md §Hardening); per (account, client IP) lockout
  // (auth.service.ts, DEC-115) is the separate, complementary defense: it locks
  // only the attacking IP out of an account, never the account's real user.
  @Post('login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Log in with email/password, returns an access token and sets a refresh cookie' })
  // Note: no @HttpCode override, so Nest's default POST success status (201)
  // is what's actually returned — documented as 201 here to match reality,
  // not the 200 the original decorator (pre-existing) had claimed.
  @ApiResponse({ status: 201, description: 'Login succeeded', type: LoginResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (malformed email, or empty password) — global ValidationPipe',
    type: ValidationErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials, or this account is temporarily locked for this client IP',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 429,
    description: 'Too many login attempts from this source — rate-limited (5/60s)',
    type: ErrorResponseDto,
  })
  async login(
    @Body() body: LoginDto,
    @Req() req: { ip?: string },
    @Res({ passthrough: true }) res: MinimalResponse,
  ): Promise<{ accessToken: string; user: unknown }> {
    const { accessToken, refreshToken, user } = await this.authService.login(body.email, body.password, req.ip);

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, this.cookieOptions());

    return { accessToken, user };
  }

  @Post('refresh')
  @UseGuards(JwtRefreshGuard)
  @ApiOperation({ summary: 'Rotate the access token using the refresh cookie' })
  // Same default-POST-status note as login() above: actually 201, not 200.
  @ApiResponse({ status: 201, description: 'A new access token was issued', type: RefreshResponseDto })
  @ApiResponse({
    status: 401,
    description: 'Missing, invalid, or revoked refresh session',
    type: ErrorResponseDto,
  })
  async refresh(
    @CurrentUser() currentUser: CurrentSessionUser,
    @Res({ passthrough: true }) res: MinimalResponse,
  ): Promise<{ accessToken: string }> {
    const { accessToken, refreshToken } = await this.authService.refresh(currentUser.id, currentUser.sid);

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, this.cookieOptions());

    return { accessToken };
  }

  // DEC-078: guarded by JwtRefreshGuard (not JwtAccessGuard) — logout's job is
  // to revoke the Session identified by the refresh cookie being used to log
  // out, the same cookie `refresh` itself authenticates against. There is no
  // session id to revoke without it.
  @Post('logout')
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the current session and clear the refresh cookie' })
  @ApiResponse({ status: 204, description: 'Session revoked — no response body' })
  @ApiResponse({
    status: 401,
    description: 'Missing, invalid, or already-revoked refresh session',
    type: ErrorResponseDto,
  })
  async logout(@CurrentUser() currentUser: CurrentSessionUser, @Res() res: MinimalResponse): Promise<void> {
    await this.authService.logout(currentUser.sid);

    // Bare @Res() (no passthrough): this handler owns the whole response, so
    // the global TransformInterceptor's { data } wrapping never gets sent —
    // a true empty 204 body, not `{"data":undefined}`.
    res.clearCookie(REFRESH_COOKIE_NAME, { path: this.cookieOptions().path });
    res.status(HttpStatus.NO_CONTENT).send();
  }

  @Get('me')
  @UseGuards(JwtAccessGuard)
  @ApiOperation({ summary: 'Return the currently authenticated user' })
  @ApiResponse({ status: 200, description: 'The current user', type: UserViewDto })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    type: ErrorResponseDto,
  })
  me(@CurrentUser() currentUser: CurrentUserId): Promise<unknown> {
    return this.authService.me(currentUser.id);
  }

  private cookieOptions() {
    return buildRefreshCookieOptions(this.configService.getOrThrow<boolean>('COOKIE_SECURE'));
  }
}
