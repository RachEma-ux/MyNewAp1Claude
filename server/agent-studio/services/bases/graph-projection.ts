/**
 * Bases — Knowledge Graph projection bridge (T-F.2).
 *
 * Mirrors the vault-projection pattern in
 * `services/vault/graph-projection.ts`. Every base + base-row mutation
 * pushes an entry onto `ags_graph_projection_sync_jobs`; the existing
 * drain cron + ProjectionSyncWorker turn those rows into Neo4j writes
 * via the new `base.*` event kinds added in this PR.
 *
 * Event kinds (declared in `graph/projection/sync-worker.ts`):
 *   - `base.created`     — upsert Base node
 *   - `base.updated`     — upsert Base node (slug/name may have changed)
 *   - `base.deleted`     — delete Base node (DETACH cascades rows)
 *   - `base.row_changed` — upsert BaseRow node + OF_BASE edge to Base;
 *                          optional ROW_OF_NOTE edge when noteId is set
 *   - `base.row_removed` — delete BaseRow node
 *
 * Fire-and-forget contract: the callers in `bases-service.ts` invoke
 * these helpers without `await` (or via `void`-prefixed promise)
 * so a projection-queue failure logs a warning but never rolls back
 * the Postgres mutation. Postgres remains canonical.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` import — uses GraphRepository.enqueueProjectionJob.
 *   - No `openrouter` / `dispatchMcpToolCall`.
 *   - All graph mutation flows through the existing chokepoint.
 */

import { getGraphRepository } from "../graph/repository/index.js";
import type { GraphRepository } from "../graph/repository/types.js";

export type BaseProjectionEventKind =
  | "base.created"
  | "base.updated"
  | "base.deleted"
  | "base.row_changed"
  | "base.row_removed";

export interface EnqueueBaseProjectionInput {
  readonly baseId: number;
  readonly workspaceId: number | null;
  readonly vaultId: number | null;
  readonly slug: string;
  readonly name: string;
  readonly eventKind: "base.created" | "base.updated";
}

export async function enqueueBaseProjection(
  input: EnqueueBaseProjectionInput,
  options: { graphRepo?: GraphRepository } = {},
): Promise<{ jobId: number }> {
  const graphRepo = options.graphRepo ?? getGraphRepository();
  return graphRepo.enqueueProjectionJob({
    projectionKey: `base:${input.baseId}`,
    triggerEvent: input.eventKind,
    triggerPayload: {
      baseId: input.baseId,
      workspaceId: input.workspaceId,
      vaultId: input.vaultId,
      slug: input.slug,
      name: input.name,
    },
  });
}

export async function enqueueBaseDeletion(
  input: { baseId: number },
  options: { graphRepo?: GraphRepository } = {},
): Promise<{ jobId: number }> {
  const graphRepo = options.graphRepo ?? getGraphRepository();
  return graphRepo.enqueueProjectionJob({
    projectionKey: `base:${input.baseId}`,
    triggerEvent: "base.deleted",
    triggerPayload: { baseId: input.baseId },
  });
}

export interface EnqueueBaseRowProjectionInput {
  readonly rowId: number;
  readonly baseId: number;
  readonly noteId: number | null;
}

export async function enqueueBaseRowProjection(
  input: EnqueueBaseRowProjectionInput,
  options: { graphRepo?: GraphRepository } = {},
): Promise<{ jobId: number }> {
  const graphRepo = options.graphRepo ?? getGraphRepository();
  return graphRepo.enqueueProjectionJob({
    projectionKey: `base_row:${input.rowId}`,
    triggerEvent: "base.row_changed",
    triggerPayload: {
      rowId: input.rowId,
      baseId: input.baseId,
      noteId: input.noteId,
    },
  });
}

export async function enqueueBaseRowRemoval(
  input: { rowId: number },
  options: { graphRepo?: GraphRepository } = {},
): Promise<{ jobId: number }> {
  const graphRepo = options.graphRepo ?? getGraphRepository();
  return graphRepo.enqueueProjectionJob({
    projectionKey: `base_row:${input.rowId}`,
    triggerEvent: "base.row_removed",
    triggerPayload: { rowId: input.rowId },
  });
}
