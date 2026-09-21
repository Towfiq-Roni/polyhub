import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { JwtAccessGuard } from './guards/jwt-access.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';

/**
 * `JwtModule.register({})` deliberately registers NO default secret/options —
 * AuthService picks the secret and TTL per call (`JWT_ACCESS_SECRET`/TTL vs
 * `JWT_REFRESH_SECRET`/TTL) since one `JwtService` instance must sign both
 * token kinds with different secrets (build spec Batch 10, point 4).
 *
 * `ThrottlerGuard` is provided here (not globally) so `@UseGuards(ThrottlerGuard)`
 * on the login route alone can resolve it via this module's DI — `ThrottlerModule`
 * (app.module.ts) only exports its options/storage providers, not the guard class
 * itself, and this task deliberately does NOT bind it as a global APP_GUARD.
 * `Reflector` is provided explicitly alongside it: real app bootstrap gets one
 * for free from Nest's internal core module, but `Test.createTestingModule`
 * (app.module.spec.ts) resolves this module's providers in isolation and needs
 * it declared here for `ThrottlerGuard`'s own constructor to resolve.
 */
@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAccessStrategy,
    JwtRefreshStrategy,
    JwtAccessGuard,
    JwtRefreshGuard,
    ThrottlerGuard,
    Reflector,
  ],
})
export class AuthModule {}
