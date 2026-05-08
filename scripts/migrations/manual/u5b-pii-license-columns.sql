-- Manual ops migration — U5-b.1 PII / license schema retrofit
--
-- Authority: docs/architecture/agent-studio/RAC_PII_LICENSE_ENFORCEMENT.md (ADR; PR #305)
-- Deployment: ASDB (Agent Studio dedicated database)
-- Run: psql -d asdb -f scripts/migrations/manual/u5b-pii-license-columns.sql
--
-- Adds three columns required by sub-phases U5-b.2 (detector +
-- license extraction at ingestion) and U5-b.3 (retrieval-time
-- enforcement):
--
--   - ags_knowledge_units.license          VARCHAR(64) — SPDX-or-
--     site-label tag; NULL = unknown.
--   - ags_knowledge_units.pii_findings     JSONB — denormalized
--     projection of ingestion-time PII findings; NULL = no PII.
--   - ags_rac_policies.license_blocklist   JSONB — per-policy
--     `string[]` of blocklisted license values; NULL = no blocking
--     even when licensePolicy="block".
--
-- Why is this manual?
--   ASDB uses an idempotent table-by-table reconciler in
--   server/agent-studio/db/seed.ts that emits ALTER TABLE ADD COLUMN
--   IF NOT EXISTS for any column declared in Drizzle but missing
--   live (Phase 19c column-drift handling). On the next ASDB boot
--   the seed will pick these columns up automatically. This script
--   exists as an explicit one-off path for operators who want the
--   schema applied without restarting the agent-studio service.
--   Same shape as scripts/migrations/manual/kb-listing-partial-index.sql.
--
-- Idempotent: every statement uses ADD COLUMN IF NOT EXISTS, so
-- running the script after the seed (or vice versa) is a no-op.

BEGIN;

-- 1. ags_knowledge_units.license — free-form SPDX or site label
ALTER TABLE ags_knowledge_units
  ADD COLUMN IF NOT EXISTS license VARCHAR(64);

-- 2. ags_knowledge_units.pii_findings — denormalized findings
--    projection. Shape locks in U5-b.2 to:
--      Array<{entity: string; start: number; end: number;
--             severity: "warn" | "block"}>
ALTER TABLE ags_knowledge_units
  ADD COLUMN IF NOT EXISTS pii_findings JSONB;

-- 3. ags_rac_policies.license_blocklist — per-policy blocklist.
--    Shape: string[] (e.g., ["GPL-3.0-or-later", "proprietary"]).
ALTER TABLE ags_rac_policies
  ADD COLUMN IF NOT EXISTS license_blocklist JSONB;

COMMIT;

-- Verification (run after the script completes):
--   SELECT column_name, data_type
--     FROM information_schema.columns
--    WHERE table_name = 'ags_knowledge_units'
--      AND column_name IN ('license', 'pii_findings');
--   -- Should return both rows.
--
--   SELECT column_name, data_type
--     FROM information_schema.columns
--    WHERE table_name = 'ags_rac_policies'
--      AND column_name = 'license_blocklist';
--   -- Should return 1 row.
--
-- Back-out (only if U5-b is rolled back as a whole — these columns
-- are nullable and adding them carries no breaking change risk for
-- existing readers, so back-out is rarely needed):
--   ALTER TABLE ags_knowledge_units DROP COLUMN IF EXISTS license;
--   ALTER TABLE ags_knowledge_units DROP COLUMN IF EXISTS pii_findings;
--   ALTER TABLE ags_rac_policies    DROP COLUMN IF EXISTS license_blocklist;
