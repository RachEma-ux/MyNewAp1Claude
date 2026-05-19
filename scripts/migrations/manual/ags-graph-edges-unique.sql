-- Manual ops migration — ags_graph_edges
--   `(type_key, edge_key) WHERE edge_key IS NOT NULL` UNIQUE INDEX
--
-- Authority: no-deferral TODO catalogue slice 4 (2026-05-19),
--   `docs/implementation/agent-studio-no-deferral-todo-2026-05-19.md`.
-- Companion to the drizzle declaration:
--   `idx_ags_graph_edges_type_edge_key` in
--   `drizzle/tables/agent-studio-graph.ts`.
-- Deployment: ASDB (Agent Studio dedicated database).
-- Run: psql -d asdb -f scripts/migrations/manual/ags-graph-edges-unique.sql
--
-- Why is this needed?
--   Pre-slice-4 `upsertEdge` used a blind INSERT — every projection-sync
--   pass that re-emitted the same edge appended a duplicate row to
--   `ags_graph_edges`. The Local + Global canvas viz had to dedup
--   client-side via `${sourceId}|${typeKey}|${targetId}` to avoid
--   overlapping rendered edges (see `LocalGraphCanvas.tsx:188`).
--
-- Post-slice-4 `upsertEdge` uses `onConflictDoUpdate` against this
--   index when `edgeKey` is set. Null-keyed rows (legacy/derived
--   computed edges) bypass the index via its WHERE clause.
--
-- Why is this manual?
--   ASDB uses an idempotent table-by-table reconciler (see
--   `server/agent-studio/db/seed.ts`) that emits
--   `CREATE UNIQUE INDEX IF NOT EXISTS` from drizzle's
--   `uniqueIndex()` declarations on FRESH instances. On EXISTING
--   instances duplicate rows can already be present from
--   pre-slice-4 traffic; `IF NOT EXISTS` short-circuits silently
--   and the duplicate-dedup never runs. Same pattern as
--   `ags-pending-perm-draft-hash-unique.sql`.
--
-- Impact when NOT applied:
--   Application code continues to upsert via `onConflictDoUpdate`,
--   but Postgres rejects the constraint mismatch if the index
--   doesn't exist; in practice the catch falls back to plain insert
--   — same shape as pre-slice-4. Manual application is required
--   for the DB backstop to take effect.

BEGIN;

-- 1. Reconcile any pre-existing duplicate (type_key, edge_key)
--    tuples. Keep the row with the highest id (latest insert),
--    delete the older ones. Null-key rows are left alone — the
--    partial unique index ignores them anyway.
WITH duplicates AS (
    SELECT id,
           type_key,
           edge_key,
           ROW_NUMBER() OVER (
             PARTITION BY type_key, edge_key
             ORDER BY id DESC
           ) AS rn
    FROM ags_graph_edges
    WHERE edge_key IS NOT NULL
)
DELETE FROM ags_graph_edges
WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
);

-- 2. Create the partial UNIQUE index. Same name as the drizzle
--    declaration so seed.ts's `CREATE UNIQUE INDEX IF NOT EXISTS`
--    short-circuits on subsequent boots.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ags_graph_edges_type_edge_key
    ON ags_graph_edges (type_key, edge_key)
    WHERE edge_key IS NOT NULL;

COMMIT;

-- Verification:
--   SELECT indexname, indexdef
--     FROM pg_indexes
--    WHERE tablename = 'ags_graph_edges'
--      AND indexname = 'idx_ags_graph_edges_type_edge_key';
--   -- Should show: CREATE UNIQUE INDEX idx_ags_graph_edges_type_edge_key
--   --              ON public.ags_graph_edges
--   --              USING btree (type_key, edge_key)
--   --              WHERE (edge_key IS NOT NULL)
--
-- Back-out:
--   DROP INDEX IF EXISTS idx_ags_graph_edges_type_edge_key;
