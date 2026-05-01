/**
 * Coordinator WorkflowStore
 *
 * The runtime drives workflows through an injectable store. The default
 * implementation is in-memory (test/dev). Production deployments should
 * provide a `DbWorkflowStore` (foundation included below) backed by the
 * `coordinator_workflows` table, schema in
 * `migrations/coordinator/001_workflows.sql`.
 *
 * The DB-backed implementation is intentionally left as a stub that
 * THROWS on every method — provisioning the table and selecting a host
 * DB are deployment decisions outside this PR's scope. To opt in at
 * runtime, a deployment wires its own implementation through
 * `setWorkflowStore()`. Tests cover the in-memory path.
 */

import type { Workflow, WorkflowStatus } from "./types";

export interface WorkflowStore {
  insert(w: Workflow): Promise<void>;
  update(id: string, patch: Partial<Workflow>): Promise<void>;
  get(id: string): Promise<Workflow | null>;
  list(filter?: {
    workspaceId?: number | string;
    status?: WorkflowStatus;
  }): Promise<Workflow[]>;
}

export class InMemoryWorkflowStore implements WorkflowStore {
  private map = new Map<string, Workflow>();
  async insert(w: Workflow): Promise<void> {
    this.map.set(w.workflowId, w);
  }
  async update(id: string, patch: Partial<Workflow>): Promise<void> {
    const prev = this.map.get(id);
    if (!prev) return;
    this.map.set(id, { ...prev, ...patch, updatedAt: new Date().toISOString() });
  }
  async get(id: string): Promise<Workflow | null> {
    return this.map.get(id) ?? null;
  }
  async list(filter?: {
    workspaceId?: number | string;
    status?: WorkflowStatus;
  }): Promise<Workflow[]> {
    return [...this.map.values()].filter((w) => {
      if (filter?.workspaceId !== undefined && w.workspaceId !== filter.workspaceId)
        return false;
      if (filter?.status && w.status !== filter.status) return false;
      return true;
    });
  }
}

/**
 * Foundation for a Postgres-backed store. Throws on every call — wire
 * a real implementation via `setWorkflowStore()` once the
 * `coordinator_workflows` table is provisioned.
 *
 * The expected DDL is recorded in
 * `migrations/coordinator/001_workflows.sql` and re-stated here in the
 * comment for reviewer convenience:
 *
 *   CREATE TABLE coordinator_workflows (
 *     workflow_id        TEXT PRIMARY KEY,
 *     workflow_type      TEXT NOT NULL,
 *     workspace_id       TEXT NOT NULL,
 *     actor_id           TEXT NOT NULL,
 *     correlation_id     TEXT NOT NULL,
 *     status             TEXT NOT NULL,
 *     steps              JSONB NOT NULL,
 *     created_at         TIMESTAMPTZ NOT NULL,
 *     updated_at         TIMESTAMPTZ NOT NULL,
 *     completed_at       TIMESTAMPTZ NULL,
 *     failure_reason     TEXT NULL
 *   );
 *   CREATE INDEX coordinator_workflows_status_idx
 *     ON coordinator_workflows (status);
 *   CREATE INDEX coordinator_workflows_workspace_idx
 *     ON coordinator_workflows (workspace_id);
 */
export class DbWorkflowStoreNotConfigured implements WorkflowStore {
  private readonly msg =
    "DbWorkflowStore is not configured. Either keep the InMemoryWorkflowStore default or wire a Postgres implementation via setWorkflowStore().";
  async insert(_w: Workflow): Promise<void> {
    throw new Error(this.msg);
  }
  async update(_id: string, _patch: Partial<Workflow>): Promise<void> {
    throw new Error(this.msg);
  }
  async get(_id: string): Promise<Workflow | null> {
    throw new Error(this.msg);
  }
  async list(): Promise<Workflow[]> {
    throw new Error(this.msg);
  }
}
