import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Thin Prisma wrapper: connects on module init, disconnects on module destroy.
 * `onModuleDestroy` (rather than Prisma's `beforeExit` process-event hook) is
 * used because Nest's own `app.enableShutdownHooks()` (wired in main.ts)
 * already calls each provider's `onModuleDestroy` on SIGTERM/SIGINT — one
 * shutdown mechanism instead of two overlapping ones.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
