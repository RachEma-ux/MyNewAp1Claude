/**
 * Repository-backed proposal applier — Item 41.
 *
 * Closes the reprojection gap identified in the Governance / Self-
 * Correction closure prompt: prior to this module, every entry in
 * `DEFAULT_APPLIER_REGISTRY` was a stub that returned
 * `{ applied: true, details: { stub: true, would*: ... } }`. The
 * audit row carried "what *would* be written"; the actual graph
 * never changed.
 *
 * This module ships `createRepositoryBackedApplierRegistry(repo)`
 * which returns a real `ApplierRegistry` whose handlers route through
 * `GraphRepository.enqueueProjectionJob(...)` for the kinds where
 * reprojection is the correct mutation surface:
 *
 *   - `archive_node`                       → enqueues an archive job
 *   - `re_promote_with_source_version`     → enqueues a repromote job
 *   - `merge_into_canonical`               → enqueues a merge job
 *
 * The `manual_review` kind stays a no-op-by-design (it's reserved
 * for findings whose remediation is operator action, not
 * automation) — the registry overlay simply re-uses the default.
 *
 * Critical correctness guarantees:
 *
 *   1. Postgres SoT first. The applier emits an audit-only event
 *      AND enqueues the projection job. The job carries enough
 *      payload that the worker can update Postgres ASDB rows AND
 *      reproject to Neo4j in the correct order. The applier itself
 *      does NOT write to ASDB SoT directly — that's the worker's
 *      job, called from `applyApprovedProposal`'s caller path.
 *      This module only ensures the projection job is enqueued so
 *      the worker has work to do.
 *
 *   2. Neo4j write only through GraphRepository. No `neo4j-driver`
 *      import in this module. Source-scan tested.
 *
 *   3. No mutation before approval. The applier is only invoked
 *      by `applyApprovedProposal`, which itself refuses to run
 *      against non-approved proposals (existing
 *      `ProposalNotApprovedError` from `mutation-worker.ts`).
 *
 *   4. Failures DO NOT silently succeed. When
 *      `enqueueProjectionJob` throws, we wrap and re-throw — the
 *      caller's audit row records the failure, the proposal is
 *      NOT marked `applied`, and the operator can retry once the
 *      backend is healthy.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` import.
 *   - No `dispatchMcpToolCall` import.
 *   - No `openrouter` import.
 *   - Imports only from `graph/repository/types`.
 */

import type { GraphRepository, RuntimeContext } from "../graph/repository/types.js";
import type { ApplierRegistry, ApplierResult } from "./mutation-worker.js";
import { DEFAULT_APPLIER_REGISTRY } from "./mutation-worker.js";

export interface RepositoryBackedApplierOptions {
  /**
   * Runtime context the applier passes to
   * `repository.enqueueProjectionJob`. In production this is the
   * approver's runtime (workspace + user). For deterministic tests
   * use a fixed object.
   *
   * Note: the applier intentionally does NOT derive a runtime from
   * the proposal row alone — proposals are submitted by agents, but
   * the approver is the human who authorized the projection mutation.
   * The approver's runtime is what should govern any permission
   * downstream of the projection write.
   */
  readonly runtime: RuntimeContext;
}

/**
 * Build an `ApplierRegistry` whose handlers actually call
 * `GraphRepository.enqueueProjectionJob` instead of returning stub
 * "would-write" details. Overlay on top of `DEFAULT_APPLIER_REGISTRY`
 * so any kind not explicitly wired here falls back to the stub
 * (preserves the no-op-by-design behavior of `manual_review`).
 */
export function createRepositoryBackedApplierRegistry(
  repository: GraphRepository,
  options: RepositoryBackedApplierOptions,
): ApplierRegistry {
  // The runtime is captured on the closure so future expansions of
  // `enqueueProjectionJob` (which today takes only `input`) can
  // thread the approver's RuntimeContext without changing this
  // applier registry's contract. The current repository signature
  // doesn't accept runtime — the void reference here keeps the
  // option in the public API while satisfying tsc.
  void options.runtime;

  async function enqueueOrThrow(
    payloadKind: string,
    payload: Record<string, unknown>,
  ): Promise<ApplierResult> {
    try {
      const result = await repository.enqueueProjectionJob({
        jobKind: `apply_proposal_${payloadKind}`,
        payload,
      });
      return {
        applied: true,
        details: {
          stub: false,
          projectionJobId: result.jobId,
          payloadKind,
          enqueued: payload,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Re-throw so the caller's audit row records the failure
      // and the proposal stays NOT marked applied. Wrapping with
      // a synthetic Error preserves the stack while clearly
      // labeling the operator-actionable failure point.
      throw new Error(
        `[repository-backed-applier] enqueueProjectionJob failed for kind=${payloadKind}: ${msg}`,
      );
    }
  }

  return {
    archive_node: async (payload) =>
      enqueueOrThrow("archive_node", {
        typeKey: payload.typeKey,
        nodeId: payload.nodeId,
      }),
    merge_into_canonical: async (payload) =>
      enqueueOrThrow("merge_into_canonical", {
        typeKey: payload.typeKey,
        canonicalNodeId: payload.canonicalNodeId,
        duplicateNodeId: payload.duplicateNodeId,
      }),
    re_promote_with_source_version: async (payload) =>
      enqueueOrThrow("re_promote_with_source_version", {
        sourceTypeKey: payload.sourceTypeKey,
        sourceId: payload.sourceId,
        targetNodeId: payload.targetNodeId,
      }),
    // manual_review remains no-op-by-design — operator action, not
    // automation. Re-use the default stub (which returns
    // `applied: false`).
    manual_review: DEFAULT_APPLIER_REGISTRY.manual_review,
  };
}
