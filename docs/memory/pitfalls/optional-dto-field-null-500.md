---
name: optional-dto-field-null-500
description: In PATCH DTOs, `@IsOptional()` also skips validation for null; a null reaching a required Prisma column is a 500, not a 400. Use `@ValidateIf((_, v) => v !== undefined)`.
type: pitfall
---
Found by the #2 Stage B review (2026-10-25): `PATCH /users/:id` with `{"email":null}` returned 500. `@IsOptional()` skips all validators for both `undefined` and `null`; the service only tested `=== undefined`, so null reached `prisma.user.update` on a required column (PrismaClientValidationError, not P2002).

**Why:** class-validator treats null like "absent" under `@IsOptional()`. The e2e suite had no null-body cases, so it stayed green.

**How to apply:** for an optional-but-not-nullable field use `@ValidateIf((_, v) => v !== undefined)` plus the real validators. Add `{field:null}` → 400 cases (row unchanged) to every PATCH e2e suite. Fixed in `apps/api/src/modules/users/dto/user-requests.dto.ts`.
