-- Manual ops migration — workspace default provider bindings table
--
-- Authority: PMB Phase 29.1b (D-WDB-1..8 in
--   `docs/architecture/provider-model-binding/WORKSPACE_DEFAULT_BINDING_DECISION.md`)
-- Deployment: ASDB (Agent Studio dedicated database)
-- Run: psql -d asdb -f scripts/migrations/manual/workspace-default-provider-bindings.sql
--
-- Creates `ags_workspace_default_provider_bindings` — the workspace-default
-- Provider Connection lookup primitive consumed by the 4 deferred Phase 29
-- caller migrations (LR-02 / LR-03 / LR-04 / LR-08). Keyed by
-- `(workspace_id, role)`; role values per D-WDB-4 are
-- `chat` | `embedding` | `tool` | `classifier` (free TEXT — adding a role
-- does not require a migration).
--
-- Why is this manual?
--   ASDB uses an idempotent table-by-table reconciler (see
--   `server/agent-studio/db/seed.ts`) — it does NOT execute the numbered
--   SQL files under `drizzle/`. The reconciler picks up the new table from
--   the Drizzle declaration on next boot — this script is for operators
--   who want the table available before the next ASDB process restart.
--   Same shape as `kb-listing-partial-index.sql` and
--   `pgvector-optional-engine.sql` (PR #223 lesson).
--
-- Idempotent: safe to run repeatedly. No data is rewritten by re-runs.

BEGIN;

CREATE TABLE IF NOT EXISTS ags_workspace_default_provider_bindings (
  id                          SERIAL       PRIMARY KEY,
  workspace_id                INTEGER      NOT NULL,
  role                        VARCHAR(32)  NOT NULL,
  provider_connection_id      INTEGER      NOT NULL,
  provider_catalog_entry_id   INTEGER,
  model_ref                   VARCHAR(255) NOT NULL,
  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by                  INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ags_workspace_default_bindings_ws_role
  ON ags_workspace_default_provider_bindings (workspace_id, role);

CREATE INDEX IF NOT EXISTS idx_ags_workspace_default_bindings_provider_connection
  ON ags_workspace_default_provider_bindings (provider_connection_id);

COMMIT;

-- Verification (run separately after migration):
--   \d ags_workspace_default_provider_bindings
--   SELECT indexname, indexdef FROM pg_indexes
--    WHERE tablename = 'ags_workspace_default_provider_bindings';
--
-- Expected:
--   - Table exists with the 9 columns above
--   - Indexes: uniq_ags_workspace_default_bindings_ws_role (UNIQUE on workspace_id, role)
--   - Indexes: idx_ags_workspace_default_bindings_provider_connection (provider_connection_id)
