-- Safety net (#51 / DEC-110): case-insensitive uniqueness for users.email.
-- Expression index: not expressible in schema.prisma; Prisma ignores it (verified: no drift, migrate dev proposes nothing).
-- Rollback: forward migration with DROP INDEX "users_email_lower_key";
-- Pre-check: fail loudly if existing rows would collide.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "users" GROUP BY lower("email") HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'users.email case-variant duplicates exist; resolve before applying';
  END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (lower("email"));
