-- Manual ops migration — ags_pending_permission_requests
--   `(agent_draft_id, proposed_tool_call_hash)` UNIQUE INDEX
--
-- Authority: M2-c6 closure (cycle-6 audit
--   `/sdcard/Download/RUNTIME_GATE_AUDIT_2026-05-09.md` §M2-c6).
-- Companion to PR-A drizzle declaration (`uniqueIndex(...)` on
--   the same columns; merged at #351 / 1b8b70d).
-- Deployment: ASDB (Agent Studio dedicated database)
-- Run: psql -d asdb -f scripts/migrations/manual/ags-pending-perm-draft-hash-unique.sql
--
-- Pre-cycle-6 the lookup index `idx_ags_pending_perm_draft_hash`
-- was non-unique. The SELECT-then-INSERT inside
-- `createApprovalRequest` could race — two concurrent calls
-- between SELECT and INSERT both saw "no existing row" and both
-- INSERTed, leaving the table with two pending rows for the same
-- `(draft, hash)` tuple. The doc-comment literally said
-- "unique-ish".
--
-- Post-cycle-6 (PR-A) the drizzle declaration promotes the index
-- to UNIQUE, and `createApprovalRequest` catches PG's
-- unique_violation (SQLSTATE 23505) and re-SELECTs to recover the
-- winning row's id, preserving the silent-dedup contract.
--
-- Why is this manual?
--   ASDB uses an idempotent table-by-table reconciler (see
--   `server/agent-studio/db/seed.ts:109-126`) that emits
--   `CREATE UNIQUE INDEX IF NOT EXISTS` from drizzle's
--   `uniqueIndex()` declarations on FRESH instances. But on
--   EXISTING instances the index name `idx_ags_pending_perm_draft_hash`
--   is already present (as the legacy non-unique index from the
--   pre-cycle-6 declaration), so `IF NOT EXISTS` short-circuits
--   to a no-op — the legacy index stays non-unique and the DB
--   backstop never gets installed. The non-unique → unique
--   upgrade requires a DROP + CREATE step that is too dangerous to
--   run from the boot-time reconciler (would trash existing
--   duplicate rows blindly, and would block startup on a single
--   transient race).
--
-- Impact when NOT applied:
--   Existing ASDB instances continue to rely on the application-level
--   SELECT-then-INSERT check in `createApprovalRequest`. The race
--   window is narrow (microseconds between SELECT and INSERT) but
--   real — under high-concurrency load (multiple agents retrying
--   the same tool call) duplicate pending rows can accumulate.
--   The PR-A application-level retry handles the post-upgrade
--   case but does nothing if the DB constraint isn't installed.

BEGIN;

-- 1. Detect any pre-existing duplicates BEFORE attempting the unique
--    constraint. Without this, `CREATE UNIQUE INDEX` would fail with
--    a constraint-violation error on the first duplicate row, and
--    the operator would be left guessing which rows to clean up.
--    Aborts the transaction with a clear error if duplicates exist.
DO $$
DECLARE
    dup_count INTEGER;
    dup_sample TEXT;
BEGIN
    SELECT COUNT(*) INTO dup_count
    FROM (
        SELECT agent_draft_id, proposed_tool_call_hash
        FROM ags_pending_permission_requests
        WHERE agent_draft_id IS NOT NULL
          AND proposed_tool_call_hash IS NOT NULL
        GROUP BY agent_draft_id, proposed_tool_call_hash
        HAVING COUNT(*) > 1
    ) AS dups;

    IF dup_count > 0 THEN
        SELECT string_agg(
                 format('(draft=%s, hash=%s)',
                        agent_draft_id,
                        substring(proposed_tool_call_hash, 1, 12) || '...'),
                 E'\n  '
               )
          INTO dup_sample
          FROM (
            SELECT agent_draft_id, proposed_tool_call_hash
            FROM ags_pending_permission_requests
            WHERE agent_draft_id IS NOT NULL
              AND proposed_tool_call_hash IS NOT NULL
            GROUP BY agent_draft_id, proposed_tool_call_hash
            HAVING COUNT(*) > 1
            LIMIT 10
          ) AS sample;

        RAISE EXCEPTION
          'M2-c6 PR-B: % duplicate (agent_draft_id, proposed_tool_call_hash) tuples found. Reconcile manually before re-running this migration. Sample (up to 10):%  %',
          dup_count, E'\n', dup_sample
          USING HINT = 'For each duplicate tuple, decide which row is canonical (typically the lowest id / oldest created_at) and DELETE the others. Then re-run this script.';
    END IF;
END $$;

-- 2. Drop the legacy non-unique index. `IF EXISTS` makes this
--    idempotent — re-runs after a successful migration are no-ops.
DROP INDEX IF EXISTS idx_ags_pending_perm_draft_hash;

-- 3. Create the UNIQUE index. Same name as the drizzle declaration
--    so seed.ts's `CREATE UNIQUE INDEX IF NOT EXISTS` short-circuits
--    on subsequent boots (the index now exists with the right
--    uniqueness) instead of trying to recreate.
CREATE UNIQUE INDEX idx_ags_pending_perm_draft_hash
    ON ags_pending_permission_requests
    (agent_draft_id, proposed_tool_call_hash);

COMMIT;

-- Verification (run after the script completes):
--   SELECT indexname, indexdef
--     FROM pg_indexes
--    WHERE tablename = 'ags_pending_permission_requests'
--      AND indexname = 'idx_ags_pending_perm_draft_hash';
--   -- Should show: CREATE UNIQUE INDEX idx_ags_pending_perm_draft_hash
--   --              ON public.ags_pending_permission_requests
--   --              USING btree (agent_draft_id, proposed_tool_call_hash)
--
-- Back-out (returns to pre-cycle-6 non-unique-index state — note
-- this also disables the application-level retry's silent-dedup
-- because PR-A's catch only triggers on actual unique-violations):
--   DROP INDEX IF EXISTS idx_ags_pending_perm_draft_hash;
--   CREATE INDEX idx_ags_pending_perm_draft_hash
--       ON ags_pending_permission_requests
--       (agent_draft_id, proposed_tool_call_hash);
