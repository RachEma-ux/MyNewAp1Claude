-- Manual migration: per-status metadata for background jobs.
--
-- Slice 28 of the no-deferral continuation catalogue (2026-05-19).
-- Replaces the inline `TERMINAL_BACKGROUND_JOB_STATUSES` set in
-- `services/workspace-observability/background-jobs.ts` with a
-- row-per-status lookup table.
--
-- ASDB does not run Drizzle SQL migrations (it uses a table-by-table
-- seed reconciler). This file is operator-applied via
-- `psql $DATABASE_URL_ASDB -f scripts/migrations/manual/ags-background-job-status-metadata.sql`
-- once per deployment. The Boot-time reseed in
-- `services/workspace-observability/background-job-status-metadata.ts`
-- (`seedBackgroundJobStatusMetadata`) writes the default rows
-- idempotently via `ON CONFLICT DO UPDATE`, so this migration only
-- needs to CREATE the table.
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS ags_background_job_status_metadata (
  status      VARCHAR(50)  PRIMARY KEY,
  terminal    BOOLEAN      NOT NULL,
  retryable   BOOLEAN      NOT NULL,
  label       VARCHAR(100) NOT NULL,
  severity    VARCHAR(20)  NOT NULL,
  description TEXT,
  created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);
