import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

// Same env-before-import requirement as the other e2e-spec files (AppModule
// wires ConfigModule.forRoot({ validate: validateEnv }) at decoration time).
process.env.DATABASE_URL ??= 'postgresql://hub:hub_dev_local_only@localhost:5432/hub_dev';
process.env.JWT_ACCESS_SECRET ??= 'e2e-access-secret-at-least-16-chars';
process.env.JWT_REFRESH_SECRET ??= 'e2e-refresh-secret-at-least-16-chars';
process.env.SUPER_ADMIN_EMAIL ??= 'admin@example.com';
process.env.SUPER_ADMIN_PASSWORD ??= 'e2e-super-admin-password';
process.env.WEB_ORIGIN ??= 'http://localhost:3000';

// hub-codebase convention: every new module wires Swagger tags/operations.
// Builds the exact same OpenAPI document main.ts serves at /api/docs-json,
// so this proves the real generated document — not just that decorators are
// present in source.
describe('OpenAPI document (e2e)', () => {
  let document: OpenAPIObject;

  beforeAll(async () => {
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    const swaggerConfig = new DocumentBuilder().setTitle('Hub API').setVersion('1.0').build();
    document = SwaggerModule.createDocument(app, swaggerConfig);

    await app.close();
  });

  it('tags every auth route under "auth" with a summary and a documented 401 response', () => {
    const routes: Array<['post' | 'get', string]> = [
      ['post', '/api/v1/auth/login'],
      ['post', '/api/v1/auth/refresh'],
      ['post', '/api/v1/auth/logout'],
      ['get', '/api/v1/auth/me'],
    ];

    for (const [method, path] of routes) {
      const operation = document.paths[path]?.[method];
      expect(operation).toBeDefined();
      expect(operation?.tags).toContain('auth');
      expect(operation?.summary).toBeTruthy();
      expect(operation?.responses?.['401']).toBeDefined();
    }
  });

  it('documents LoginDto email/password as ApiProperty-backed schema fields', () => {
    const loginOperation = document.paths['/api/v1/auth/login']?.post;
    const requestBodyContent = (loginOperation?.requestBody as { content?: Record<string, { schema?: unknown }> })
      ?.content?.['application/json']?.schema as { $ref?: string } | undefined;

    expect(requestBodyContent?.$ref).toBeDefined();
    const schemaName = requestBodyContent!.$ref!.replace('#/components/schemas/', '');
    const schema = document.components?.schemas?.[schemaName] as { properties?: Record<string, unknown> };

    expect(schema?.properties?.email).toBeDefined();
    expect(schema?.properties?.password).toBeDefined();
  });

  it('tags the health route under "health" with a summary', () => {
    const operation = document.paths['/api/v1/health']?.get;
    expect(operation).toBeDefined();
    expect(operation?.tags).toContain('health');
    expect(operation?.summary).toBeTruthy();
  });

  function resolveSchema(ref: string): { properties?: Record<string, unknown> } | undefined {
    const name = ref.replace('#/components/schemas/', '');
    return document.components?.schemas?.[name] as { properties?: Record<string, unknown> } | undefined;
  }

  function responseSchemaRef(path: string, method: 'post' | 'get', status: string): string | undefined {
    const operation = document.paths[path]?.[method];
    const content = (
      operation?.responses?.[status] as { content?: Record<string, { schema?: { $ref?: string } }> } | undefined
    )?.content;
    return content?.['application/json']?.schema?.$ref;
  }

  it('documents the login 201 response as a typed LoginResponseDto with a nested typed user', () => {
    const ref = responseSchemaRef('/api/v1/auth/login', 'post', '201');
    expect(ref).toBeDefined();
    const schema = resolveSchema(ref!);
    expect(schema?.properties?.accessToken).toBeDefined();

    const userRef = (schema?.properties?.user as { $ref?: string } | undefined)?.$ref;
    expect(userRef).toBeDefined();
    const userSchema = resolveSchema(userRef!);
    expect(userSchema?.properties?.id).toBeDefined();
    expect(userSchema?.properties?.email).toBeDefined();
    expect(userSchema?.properties?.status).toBeDefined();
    expect(userSchema?.properties?.roles).toBeDefined();
  });

  it('documents login 400/401/429 error responses with typed schemas (not bare descriptions)', () => {
    for (const status of ['400', '401', '429']) {
      expect(responseSchemaRef('/api/v1/auth/login', 'post', status)).toBeDefined();
    }
  });

  it('documents the refresh 201 response as a typed RefreshResponseDto and its 401 error as typed', () => {
    const ref = responseSchemaRef('/api/v1/auth/refresh', 'post', '201');
    expect(ref).toBeDefined();
    const schema = resolveSchema(ref!);
    expect(schema?.properties?.accessToken).toBeDefined();

    expect(responseSchemaRef('/api/v1/auth/refresh', 'post', '401')).toBeDefined();
  });

  it('documents the logout 401 error as typed (204 stays bodyless)', () => {
    const operation = document.paths['/api/v1/auth/logout']?.post;
    const noContentResponse = operation?.responses?.['204'] as { content?: unknown } | undefined;
    expect(noContentResponse).toBeDefined();
    expect(noContentResponse?.content).toBeUndefined();

    expect(responseSchemaRef('/api/v1/auth/logout', 'post', '401')).toBeDefined();
  });

  it('documents the me 200 response as a typed UserViewDto and its 401 error as typed', () => {
    const ref = responseSchemaRef('/api/v1/auth/me', 'get', '200');
    expect(ref).toBeDefined();
    const schema = resolveSchema(ref!);
    expect(schema?.properties?.id).toBeDefined();
    expect(schema?.properties?.roles).toBeDefined();

    expect(responseSchemaRef('/api/v1/auth/me', 'get', '401')).toBeDefined();
  });

  it('documents the health 200 response as a typed HealthResponseDto', () => {
    const ref = responseSchemaRef('/api/v1/health', 'get', '200');
    expect(ref).toBeDefined();
    const schema = resolveSchema(ref!);
    expect(schema?.properties?.status).toBeDefined();
  });

  it('tags every users route under "users" with a summary and typed (non-bare) responses [F-28]', () => {
    const routes: Array<['post' | 'get' | 'patch', string, string[]]> = [
      ['post', '/api/v1/users', ['201', '400', '401', '403', '409']],
      ['get', '/api/v1/users', ['200', '401', '403']],
      ['get', '/api/v1/users/{id}', ['200', '400', '401', '403', '404']],
      ['patch', '/api/v1/users/{id}', ['200', '400', '401', '403', '404', '409']],
      ['post', '/api/v1/users/{id}/deactivate', ['200', '400', '401', '403', '404', '422']],
      ['post', '/api/v1/users/{id}/activate', ['200', '400', '401', '403', '404']],
      ['post', '/api/v1/users/{id}/reset-password', ['200', '400', '401', '403', '404']],
    ];

    for (const [method, path, statuses] of routes) {
      const operation = document.paths[path]?.[method];
      expect(operation).toBeDefined();
      expect(operation?.tags).toContain('users');
      expect(operation?.summary).toBeTruthy();
      for (const status of statuses) {
        const response = operation?.responses?.[status] as
          { content?: Record<string, { schema?: { $ref?: string; items?: { $ref?: string } } }> } | undefined;
        const schema = response?.content?.['application/json']?.schema;
        expect(`${method} ${path} ${status} ${schema?.$ref ?? schema?.items?.$ref}`).not.toMatch(/undefined$/);
      }
    }
  });
});
