import { z } from 'zod';

// COOKIE_SECURE arrives from process.env as a string. z.coerce.boolean() would
// treat any non-empty string (including the literal "false") as true via
// JS `Boolean(str)` semantics — wrong for an env flag. Preprocess the raw
// "true"/"false" text ourselves instead.
const stringToBoolean = z.preprocess((value) => {
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return value;
}, z.boolean());

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_ACCESS_TTL: z.string().default('1d'),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_REFRESH_TTL: z.string().default('7d'),
  LOCKOUT_MAX_ATTEMPTS: z.coerce.number().default(10),
  LOCKOUT_WINDOW_MINUTES: z.coerce.number().default(15),
  SUPER_ADMIN_EMAIL: z.string().email(),
  SUPER_ADMIN_PASSWORD: z.string().min(1),
  COOKIE_SECURE: stringToBoolean.default(false),
  PORT: z.coerce.number().default(4000),
  // No default: CORS origin must be explicit, never silently undefined.
  WEB_ORIGIN: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates process.env for NestJS's `ConfigModule.forRoot({ validate })`.
 * Required secrets (JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, SUPER_ADMIN_EMAIL,
 * SUPER_ADMIN_PASSWORD, DATABASE_URL) have no defaults — a missing one throws
 * so the app fails to boot loudly rather than run with an absent secret.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  return result.data;
}
