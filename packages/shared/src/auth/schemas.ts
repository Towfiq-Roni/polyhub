import { z } from 'zod';
import { normalizeEmail } from './email';

export const loginSchema = z.object({
  email: z.string().transform(normalizeEmail).pipe(z.string().email()),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;
