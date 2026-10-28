-- Drop legacy per-account lockout columns (unused since #52 / DEC-115; lockout now in login_attempts per (user, ip)).
-- Destructive but intentional: columns held only stale counters (no audit/forensic need, ADR-0004). Task #54.
-- Rollback (forward-only; ship as a NEW migration):
--   ALTER TABLE "users" ADD COLUMN "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
--     ADD COLUMN "first_failed_attempt_at" TIMESTAMP(3),
--     ADD COLUMN "lockout_until" TIMESTAMP(3);
ALTER TABLE "users"
  DROP COLUMN "failed_login_attempts",
  DROP COLUMN "first_failed_attempt_at",
  DROP COLUMN "lockout_until";
