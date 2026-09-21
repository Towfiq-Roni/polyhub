import { Test } from '@nestjs/testing';

// AppModule now wires ConfigModule.forRoot({ validate: validateEnv }) (Batch 6).
// That call runs as soon as app.module.ts is evaluated (it's the @Module
// decorator's argument), so AppModule can't be statically imported at the top
// of this file — the required env vars wouldn't be set yet. Each test sets
// process.env first, then `jest.resetModules()` + `require(...)` forces a
// fresh evaluation against that env. ConfigService must be re-required from
// the same fresh registry too (jest.resetModules() gives '@nestjs/config' a
// new module instance, so a statically-imported ConfigService class would be
// a different reference than the one AppModule's fresh instance uses,
// breaking DI lookup by class).
const REQUIRED_ENV = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/hub_test',
  JWT_ACCESS_SECRET: 'test-access-secret-at-least-16-chars',
  JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-16-chars',
  SUPER_ADMIN_EMAIL: 'admin@example.com',
  SUPER_ADMIN_PASSWORD: 'test-super-admin-password',
  WEB_ORIGIN: 'http://localhost:3000',
};

describe('AppModule', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, ...REQUIRED_ENV };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('compiles with ConfigModule wired globally (isGlobal) given valid env', async () => {
    const { AppModule } = require('./app.module') as typeof import('./app.module');
    const { ConfigService } = require('@nestjs/config') as typeof import('@nestjs/config');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const config = moduleRef.get(ConfigService);
    expect(config).toBeInstanceOf(ConfigService);

    await moduleRef.close();
  });
});
