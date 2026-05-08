-- Manual ops migration — U5-b.3 RAC trace counts retrofit
--
-- Authority: docs/architecture/agent-studio/RAC_PII_LICENSE_ENFORCEMENT.md (ADR; PR #305) §3.7
-- Deployment: ASDB (Agent Studio dedicated database)
-- Run: psql -d asdb -f scripts/migrations/manual/u5b3-rac-trace-counts.sql
--
-- Adds two per-trace counter columns required by U5-b.3 (retrieval-
-- time PII / license enforcement):
--
--   - ags_rac_runtime_traces.pii_blocked_count       INTEGER DEFAULT 0 NOT NULL
--   - ags_rac_runtime_traces.license_blocked_count   INTEGER DEFAULT 0 NOT NULL
--
-- The retrieval filter in services/rac/retrieval-filter.ts now drops
-- chunks whose parent unit carries a block-severity PII finding (when
-- piiPolicy="block") or whose unit license is in the profile's
-- licenseBlocklist (when licensePolicy="block"). The two counters
-- record the per-trace per-class rejection volume so operators can
-- track enforcement load without parsing the trace warnings array.
--
-- Manual-applied for the same reason as u5b-pii-license-columns.sql:
-- ASDB seed.ts emits ALTER TABLE ADD COLUMN IF NOT EXISTS for any
-- column declared in Drizzle but missing live, so the next service
-- restart picks these up automatically. This script is the explicit
-- one-off path for envs that want immediate application.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS so re-running is a no-op.

BEGIN;

-- 1. PII-blocked counter
ALTER TABLE ags_rac_runtime_traces
  ADD COLUMN IF NOT EXISTS pii_blocked_count INTEGER NOT NULL DEFAULT 0;

-- 2. License-blocked counter
ALTER TABLE ags_rac_runtime_traces
  ADD COLUMN IF NOT EXISTS license_blocked_count INTEGER NOT NULL DEFAULT 0;

COMMIT;

-- Verification:
--   SELECT column_name, data_type, column_default
--     FROM information_schema.columns
--    WHERE table_name = 'ags_rac_runtime_traces'
--      AND column_name IN ('pii_blocked_count', 'license_blocked_count');
--   -- Should return 2 rows; column_default = '0'.
--
-- Back-out (only if U5-b.3 is rolled back):
--   ALTER TABLE ags_rac_runtime_traces DROP COLUMN IF EXISTS pii_blocked_count;
--   ALTER TABLE ags_rac_runtime_traces DROP COLUMN IF EXISTS license_blocked_count;
