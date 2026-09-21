import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// AppModule wires ConfigModule.forRoot({ validate: validateEnv }) at decoration
// time (see app.module.spec.ts's comment) — required env vars must be set
// before AppModule is evaluated, so it's required fresh here rather than
// imported statically at module load time.
process.env.DATABASE_URL ??= 'postgresql://hub:hub_dev_local_only@localhost:5432/hub_dev';
process.env.JWT_ACCESS_SECRET ??= 'e2e-access-secret-at-least-16-chars';
process.env.JWT_REFRESH_SECRET ??= 'e2e-refresh-secret-at-least-16-chars';
process.env.SUPER_ADMIN_EMAIL ??= 'admin@example.com';
process.env.SUPER_ADMIN_PASSWORD ??= 'e2e-super-admin-password';
process.env.WEB_ORIGIN ??= 'http://localhost:3000';

describe('GET /api/v1/health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalInterceptors(new TransformInterceptor());
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 { data: { status: "ok" } } when the DB is reachable', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { status: 'ok' } });
  });
});
