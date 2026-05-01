-- Coordinator workflow persistence — Phase 2 foundation.
--
-- Apply to the platform appdb (or a dedicated coordinator DB if a
-- deployment chooses to isolate). The platform's InMemoryWorkflowStore
-- remains the default until a host wires a Postgres-backed
-- implementation via setWorkflowStore().
--
-- This DDL is intentionally MVP: status is a TEXT column rather than an
-- enum so the WorkflowStatus type can evolve without a migration. A
-- production migration would tighten constraints (e.g., add CHECKs).

CREATE TABLE IF NOT EXISTS coordinator_workflows (
  workflow_id        TEXT PRIMARY KEY,
  workflow_type      TEXT NOT NULL,
  workspace_id       TEXT NOT NULL,
  actor_id           TEXT NOT NULL,
  correlation_id     TEXT NOT NULL,
  status             TEXT NOT NULL,
  steps              JSONB NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL,
  updated_at         TIMESTAMPTZ NOT NULL,
  completed_at       TIMESTAMPTZ NULL,
  failure_reason     TEXT NULL
);

CREATE INDEX IF NOT EXISTS coordinator_workflows_status_idx
  ON coordinator_workflows (status);

CREATE INDEX IF NOT EXISTS coordinator_workflows_workspace_idx
  ON coordinator_workflows (workspace_id);

CREATE INDEX IF NOT EXISTS coordinator_workflows_correlation_idx
  ON coordinator_workflows (correlation_id);
