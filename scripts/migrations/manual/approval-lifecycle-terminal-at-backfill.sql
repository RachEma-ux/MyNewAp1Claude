-- Manual ops migration — approval-lifecycle terminalAt backfill
--
-- Authority: approval-lifecycle retention prerequisite sequence
-- Deployment: ASDB (Agent Studio dedicated database)
-- Run: psql -d asdb -f scripts/migrations/manual/approval-lifecycle-terminal-at-backfill.sql
--
-- Sets `terminal_at` and `terminal_reason` on existing rows of the three
-- approval-lifecycle tables that were already in a terminal state before
-- the terminalAt-aware state-transition helpers shipped (PR-B2). After
-- this migration, every pre-existing terminal row has a non-null
-- `terminal_at` so the retention sweep can compute its age.
--
-- Conservative-by-default: rows without a reliable terminal timestamp
-- (`decidedAt` / `approvedAt` / `rejectedAt` / `rolledBackAt` all null)
-- keep `terminal_at = NULL` and are preserved from sweep until manual
-- review.
--
-- Standing principle (user 2026-05-12 §0): "Do not weaken the retention
-- predicate to fit the current schema." Schema first, retention second.
--
-- Idempotency: uses `WHERE terminal_at IS NULL` so re-runs are safe.

-- ── ags_publish_requests ────────────────────────────────────────────────────

-- approved / rejected / withdrawn rows with a reliable decided_at →
-- backfill from decided_at. The extended terminal-state vocab (cancelled,
-- superseded, failed_terminal) is excluded — no row has those values pre-
-- migration because the vocab was added simultaneously with the
-- transition helper, and any row in those states from now on already
-- carries terminal_at.

UPDATE ags_publish_requests
SET
  terminal_at = decided_at,
  terminal_reason = 'backfill_from_pre_terminal_at_era'
WHERE
  terminal_at IS NULL
  AND state IN ('approved', 'rejected', 'withdrawn')
  AND decided_at IS NOT NULL;

-- ── ags_approval_steps ──────────────────────────────────────────────────────

UPDATE ags_approval_steps
SET
  terminal_at = decided_at,
  terminal_reason = 'backfill_from_pre_terminal_at_era'
WHERE
  terminal_at IS NULL
  AND state IN ('approved', 'rejected')
  AND decided_at IS NOT NULL;

-- ── ags_note_promotions ─────────────────────────────────────────────────────
--
-- The note-promotion schema carries three separate terminal timestamps
-- (approved_at / rejected_at / rolled_back_at) rather than a single
-- decided_at. Backfill from the matching column per state.

UPDATE ags_note_promotions
SET
  terminal_at = approved_at,
  terminal_reason = 'backfill_from_pre_terminal_at_era'
WHERE
  terminal_at IS NULL
  AND status = 'approved'
  AND approved_at IS NOT NULL;

UPDATE ags_note_promotions
SET
  terminal_at = rejected_at,
  terminal_reason = 'backfill_from_pre_terminal_at_era'
WHERE
  terminal_at IS NULL
  AND status = 'rejected'
  AND rejected_at IS NOT NULL;

UPDATE ags_note_promotions
SET
  terminal_at = rolled_back_at,
  terminal_reason = 'backfill_from_pre_terminal_at_era'
WHERE
  terminal_at IS NULL
  AND status = 'rolled_back'
  AND rolled_back_at IS NOT NULL;

-- ── Verification ────────────────────────────────────────────────────────────
--
-- After running the script, count rows in terminal states that still
-- have terminal_at = NULL. Each query result is the count of rows the
-- retention sweep will permanently preserve until manual reconciliation.

-- SELECT 'ags_publish_requests' AS table, COUNT(*) AS unreconciled_terminal_rows
--   FROM ags_publish_requests
--   WHERE state IN ('approved', 'rejected', 'withdrawn') AND terminal_at IS NULL
-- UNION ALL
-- SELECT 'ags_approval_steps', COUNT(*)
--   FROM ags_approval_steps
--   WHERE state IN ('approved', 'rejected') AND terminal_at IS NULL
-- UNION ALL
-- SELECT 'ags_note_promotions', COUNT(*)
--   FROM ags_note_promotions
--   WHERE status IN ('approved', 'rejected', 'rolled_back') AND terminal_at IS NULL;
