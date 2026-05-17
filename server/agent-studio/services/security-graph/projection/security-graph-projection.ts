/**
 * Security Graph Neo4j Projection — production interface (T-G.3.1).
 *
 * Pins the surface T-G.3.4 must implement. Reads from the
 * authoritative ASDB store (`persistence/`) and writes derived
 * facts into Neo4j via the GraphRepository (Phase 7.5b batched
 * UNWIND path).
 *
 * Precedent (q) carry-forward: projection ONLY reads ASDB; never
 * writes. Re-projection of an existing ingestion is a single-
 * method call.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No direct `neo4j-driver` import (Phase 7.5b path).
 *   - No `dispatchMcpToolCall`.
 *   - No `process.env.*_API_KEY` reads.
 */

export interface ProjectSecurityGraphInput {
  readonly ingestionId: string;
}

export interface ProjectSecurityGraphResult {
  readonly ingestionId: string;
  readonly nodesProjected: number;
  readonly edgesProjected: number;
  readonly durationMs: number;
}

export interface SecurityGraphProjection {
  /**
   * Project an existing ASDB security-graph ingestion into Neo4j
   * via the GraphRepository. Idempotent (Neo4j MERGE on id).
   */
  projectIngestion(
    input: ProjectSecurityGraphInput,
  ): Promise<ProjectSecurityGraphResult>;
}

/**
 * Factory entry point. T-G.3.4 returns the real GraphRepository-
 * backed implementation; today it throws so callers can wire-
 * without-using during T-G.3.1.
 *
 * The signature will evolve to take dependency-injected
 * `{ store, repository }` at T-G.3.4 (mirrors
 * `createCodeGraphProjection` from T-G.2.4).
 */
export function createSecurityGraphProjection(): SecurityGraphProjection {
  throw new Error(
    "[T-G.3.1] SecurityGraphProjection is the T-G.3.1 interface contract only; the production GraphRepository-backed implementation lands in T-G.3.4.",
  );
}
