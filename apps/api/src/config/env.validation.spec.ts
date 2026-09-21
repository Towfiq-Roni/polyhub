import { validateEnv } from './env.validation';

const validBase = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/hub',
  JWT_ACCESS_SECRET: 'access-secret-at-least-16-chars',
  JWT_REFRESH_SECRET: 'refresh-secret-at-least-16-chars',
  SUPER_ADMIN_EMAIL: 'admin@example.com',
  SUPER_ADMIN_PASSWORD: 'super-secret-password',
  WEB_ORIGIN: 'https://app.example.com',
};

describe('validateEnv', () => {
  it('throws when DATABASE_URL is missing', () => {
    const { DATABASE_URL: _omit, ...rest } = validBase;
    expect(() => validateEnv(rest)).toThrow();
  });

  it('throws when JWT_ACCESS_SECRET is missing (no silent default for secrets)', () => {
    const { JWT_ACCESS_SECRET: _omit, ...rest } = validBase;
    expect(() => validateEnv(rest)).toThrow();
  });

  it('throws when JWT_REFRESH_SECRET is missing (no silent default for secrets)', () => {
    const { JWT_REFRESH_SECRET: _omit, ...rest } = validBase;
    expect(() => validateEnv(rest)).toThrow();
  });

  it('throws when SUPER_ADMIN_EMAIL is missing', () => {
    const { SUPER_ADMIN_EMAIL: _omit, ...rest } = validBase;
    expect(() => validateEnv(rest)).toThrow();
  });

  it('throws when SUPER_ADMIN_EMAIL is not a valid email', () => {
    expect(() => validateEnv({ ...validBase, SUPER_ADMIN_EMAIL: 'not-an-email' })).toThrow();
  });

  it('throws when SUPER_ADMIN_PASSWORD is missing', () => {
    const { SUPER_ADMIN_PASSWORD: _omit, ...rest } = validBase;
    expect(() => validateEnv(rest)).toThrow();
  });

  it('throws when WEB_ORIGIN is missing (required, no default — CORS origin must be explicit)', () => {
    const { WEB_ORIGIN: _omit, ...rest } = validBase;
    expect(() => validateEnv(rest)).toThrow();
  });

  it('applies documented defaults when optional vars are absent', () => {
    const result = validateEnv(validBase);

    expect(result.JWT_ACCESS_TTL).toBe('1d');
    expect(result.JWT_REFRESH_TTL).toBe('7d');
    expect(result.LOCKOUT_MAX_ATTEMPTS).toBe(10);
    expect(result.LOCKOUT_WINDOW_MINUTES).toBe(15);
    expect(result.COOKIE_SECURE).toBe(false);
    expect(result.PORT).toBe(4000);
  });

  it('coerces numeric env vars (strings) into numbers', () => {
    const result = validateEnv({
      ...validBase,
      LOCKOUT_MAX_ATTEMPTS: '5',
      LOCKOUT_WINDOW_MINUTES: '30',
      PORT: '5000',
    });

    expect(result.LOCKOUT_MAX_ATTEMPTS).toBe(5);
    expect(result.LOCKOUT_WINDOW_MINUTES).toBe(30);
    expect(result.PORT).toBe(5000);
  });

  it('coerces COOKIE_SECURE string "true" into boolean true', () => {
    const result = validateEnv({ ...validBase, COOKIE_SECURE: 'true' });

    expect(result.COOKIE_SECURE).toBe(true);
  });

  it('coerces COOKIE_SECURE string "false" into boolean false (not JS truthy-string coercion)', () => {
    const result = validateEnv({ ...validBase, COOKIE_SECURE: 'false' });

    expect(result.COOKIE_SECURE).toBe(false);
  });

  it('passes through required string values unchanged', () => {
    const result = validateEnv(validBase);

    expect(result.DATABASE_URL).toBe(validBase.DATABASE_URL);
    expect(result.JWT_ACCESS_SECRET).toBe(validBase.JWT_ACCESS_SECRET);
    expect(result.JWT_REFRESH_SECRET).toBe(validBase.JWT_REFRESH_SECRET);
    expect(result.SUPER_ADMIN_EMAIL).toBe(validBase.SUPER_ADMIN_EMAIL);
    expect(result.SUPER_ADMIN_PASSWORD).toBe(validBase.SUPER_ADMIN_PASSWORD);
    expect(result.WEB_ORIGIN).toBe(validBase.WEB_ORIGIN);
  });
});
