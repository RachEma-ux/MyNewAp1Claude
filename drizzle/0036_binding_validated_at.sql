-- Plan v3 Phase 15 — degraded-state detection.
-- Adds last_validated_at to ags_agent_provider_bindings so the
-- "stale beyond N minutes → degraded" rule has a column to read.

ALTER TABLE "ags_agent_provider_bindings"
  ADD COLUMN IF NOT EXISTS "last_validated_at" timestamp;
