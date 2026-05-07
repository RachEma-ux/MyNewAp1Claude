-- Manual ops migration — KB-listing partial index activation
--
-- Authority: PR #220 retrofit polish (originally drizzle/0042_kb_listing_index.sql,
--   moved to manual scripts after smoke testing surfaced that ASDB does not run
--   Drizzle SQL migrations — see deployment notes below).
-- Deployment: ASDB (Agent Studio dedicated database)
-- Run: psql -d asdb -f scripts/migrations/manual/kb-listing-partial-index.sql
--
-- The kb-router's `listUnits` and `listFreshnessCounts` queries
-- (`server/agent-studio/api/kb-router.ts`) both filter on
-- `workspaceId` AND `archivedAt IS NULL` as the hot path; listUnits
-- additionally filters by sourceId; listFreshnessCounts groups by
-- freshnessState.
--
-- The Drizzle table declaration in `drizzle/tables/agent-studio.ts`
-- already includes a non-partial composite index over the same columns
-- (`idx_ags_knowledge_units_active_listing` — created by the ASDB seed
-- at startup via `server/agent-studio/db/seed.ts`). This script DROPS
-- that non-partial version and recreates it with the
-- `WHERE archived_at IS NULL` clause, which the Drizzle index() API
-- cannot express.
--
-- Why is this manual?
--   ASDB uses an idempotent table-by-table reconciler (see seed.ts) —
--   it does NOT execute the numbered SQL files under `drizzle/`. Those
--   files describe main-DB migrations only. ASDB-only schema changes
--   that Drizzle cannot model (partial indexes, custom extensions,
--   raw DDL) live here and are operator-applied. The pgvector script
--   in this directory is the same shape.
--
-- Impact when NOT applied:
--   The non-partial index still satisfies the query; the planner just
--   maintains stats on archived rows that listUnits/listFreshnessCounts
--   never read. For active-row-dominant tables the optimization is
--   marginal; for archive-heavy workloads the partial index can be
--   noticeably tighter.

BEGIN;

-- 1. Drop the non-partial version that the Drizzle seed created (if any).
--    Idempotent — no-op if the index doesn't exist or already has the
--    correct shape (the recreate below will be the partial version).
DROP INDEX IF EXISTS idx_ags_knowledge_units_active_listing;

-- 2. Recreate WITH the partial WHERE clause.
CREATE INDEX IF NOT EXISTS idx_ags_knowledge_units_active_listing
  ON ags_knowledge_units(workspace_id, source_id, freshness_state)
  WHERE archived_at IS NULL;

COMMIT;

-- Verification (run after the script completes):
--   SELECT indexdef FROM pg_indexes
--     WHERE indexname = 'idx_ags_knowledge_units_active_listing';
--   -- Should show: WHERE (archived_at IS NULL)
--
-- Back-out (returns to the Drizzle seed default — non-partial composite):
--   DROP INDEX IF EXISTS idx_ags_knowledge_units_active_listing;
--   -- The seed will recreate the non-partial version on next ASDB boot.
