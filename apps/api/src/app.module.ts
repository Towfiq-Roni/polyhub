import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';

// HealthController is registered directly here rather than via a dedicated
// HealthModule: it's a single controller with no service/DTOs of its own, so
// a wrapping module would be pure boilerplate (YAGNI — Minimal Code
// Discipline rung 1). Revisit if health gains more surface (readiness vs
// liveness, etc.).
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    // Global options only — NOT bound as a global APP_GUARD. Defense-in-depth
    // for POST /auth/login specifically (nginx already rate-limits that same
    // route at 5 r/min burst 5, analysis/deployment-plan.md §Hardening; this
    // is the app-level backstop for anything reaching the app directly). The
    // guard itself is applied via @UseGuards(ThrottlerGuard) scoped to just
    // the login handler (auth.controller.ts), not globally.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]),
    AuthModule,
    UsersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
