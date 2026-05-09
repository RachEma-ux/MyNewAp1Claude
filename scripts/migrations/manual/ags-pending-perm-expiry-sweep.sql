-- Manual ops sweep — ags_pending_permission_requests expiry reconciliation
--
-- Authority: M3-c6 closure (cycle-6 audit
--   `/sdcard/Download/RUNTIME_GATE_AUDIT_2026-05-09.md` §M3-c6).
-- Deployment: ASDB (Agent Studio dedicated database)
-- Run: psql -d asdb -f scripts/migrations/manual/ags-pending-perm-expiry-sweep.sql
-- Cadence: operator-discretion (recommended weekly; safe to run on
--   every backup/maintenance window). Idempotent — re-runs flip
--   only newly-elapsed rows.
--
-- Pre-cycle-6 there was no background sweep that flipped expired
-- `allowed` rows to `timed_out`. The runtime gate
-- (`evaluateApprovalGate`) reads `expiresAt` per-call and correctly
-- rejects expired rows with verdict="expired" — the gate itself is
-- safe. But the row's `status` column lies: it stays at "allowed"
-- forever even after the TTL elapses, which:
--
--   1. Misleads the operator UI: `tool-approvals-router.listByDraft`
--      with `status: "allowed"` returns rows whose `expiresAt` is
--      in the past, suggesting an active-permit count that is
--      higher than reality.
--   2. Accumulates row count: rows never transition to a terminal
--      state from the operator's perspective; queries that count
--      "currently-permitted tools" overcount.
--   3. Bloats list endpoints: ORDER BY createdAt DESC LIMIT 50
--      can be dominated by stale `allowed` rows.
--
-- Why operator-applied (not a built-in cron)?
--   ASDB is operator-managed (no built-in scheduler runs in the
--   app process; Phase 12.5 mandate). Operators run their own
--   maintenance windows. Mirrors the cycle-5 / cycle-6 pattern of
--   manual-SQL for ASDB-specific maintenance
--   (`ags-mcp-tool-knowledge-fk.sql`,
--   `ags-pending-perm-draft-hash-unique.sql`,
--   `kb-listing-partial-index.sql`).
--
-- Impact when NOT applied:
--   The runtime gate keeps blocking expired permits correctly, so
--   no security regression. The operator UI overcounts active
--   permits. Acceptable for low-volume installs; recommended at
--   least quarterly for active deployments.

BEGIN;

-- 1. Detect how many rows will be affected. Surfaces a NOTICE so
--    the operator sees the magnitude before COMMIT (psql prints
--    NOTICE messages immediately even inside a transaction).
DO $$
DECLARE
    sweep_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO sweep_count
    FROM ags_pending_permission_requests
    WHERE status = 'allowed'
      AND expires_at IS NOT NULL
      AND expires_at < NOW();

    RAISE NOTICE 'M3-c6 expiry sweep: % expired allowed rows will be flipped to timed_out.', sweep_count;
END $$;

-- 2. Flip expired `allowed` rows to `timed_out`. The reason field
--    distinguishes sweep-driven transitions from operator-driven
--    `timed_out` decisions (which carry decided_by IS NOT NULL or
--    a human-authored reason).
--
--    decided_at is set to expires_at (NOT NOW()) so the audit
--    trail reflects when the row actually expired, not when the
--    sweep ran.
--
--    decided_by stays NULL — the sweep is a system action, not an
--    operator action. The reason `expiry_sweep` is the marker that
--    distinguishes these from the simulation poll's
--    `simulation_timeout` reason (services/simulation.ts).
UPDATE ags_pending_permission_requests
   SET status = 'timed_out',
       decided_at = expires_at,
       decided_by = NULL,
       reason = 'expiry_sweep'
 WHERE status = 'allowed'
   AND expires_at IS NOT NULL
   AND expires_at < NOW();

COMMIT;

-- Verification (run after the script completes):
--   SELECT COUNT(*) FROM ags_pending_permission_requests
--    WHERE status = 'allowed' AND expires_at < NOW();
--   -- Should return 0 immediately after the sweep.
--
-- Counter-query (rows the sweep just touched):
--   SELECT COUNT(*) FROM ags_pending_permission_requests
--    WHERE status = 'timed_out' AND reason = 'expiry_sweep';
--
-- No back-out — the transition is semantically a CORRECTION (the
-- row was de-facto expired before the sweep; the sweep just makes
-- the status column truthful). If a row was incorrectly swept it
-- can be re-permitted via the normal createApprovalRequest path.
