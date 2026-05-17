/**
 * Code Graph Neo4j Projection — production interface (T-G.2.1).
 *
 * Pins the surface T-G.2.4 must implement. Reads from the
 * authoritative ASDB store (`persistence/`) and writes derived
 * facts into Neo4j via the GraphRepository.
 *
 * Why a separate `projection/` rather than letting `persistence/`
 * also write to Neo4j:
 *   - Source-of-truth boundary: persistence owns Postgres writes;
 *     projection owns Neo4j writes. The split is enforced by the
 *     CLAUDE.md "Postgres = source of truth" rule.
 *   - Re-projection: operators can re-project an existing ASDB
 *     ingestion into Neo4j without re-running the parser. The
 *     separation makes that a single-method call rather than a
 *     conditional inside persistence.
 *   - Failure isolation: Neo4j outages don't block ingest.
 *     Persistence completes; projection retries.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No direct `neo4j-driver` import. Projection calls through
 *     the GraphRepository surface (`services/graph/repository/`),
 *     which Phase 7.5b wires to the real driver via the KGIA
 *     adapter.
 *   - No `dispatchMcpToolCall`.
 *   - No `process.env.*_API_KEY` reads.
 */

export interface ProjectCodeGraphInput {
  /**
   * Operator-chosen identifier of the ingestion run. The projection
   * reads nodes + edges from ASDB keyed by this id and projects them
   * into Neo4j as a single batched UNWIND write (per Phase 7.5b's
   * `PROJECTION_BATCH_SIZE = 1000` carry-forward from T-E.5).
   */
  readonly ingestionId: string;
}

export interface ProjectCodeGraphResult {
  readonly ingestionId: string;
  readonly nodesProjected: number;
  readonly edgesProjected: number;
  /** Wall-clock projection duration. Operator dashboards compare
   *  this against the T-E.5 carry-forward gates (8s target,
   *  10s ceiling for ~12k-edge batches). */
  readonly durationMs: number;
}

export interface CodeGraphProjection {
  /**
   * Project an existing ASDB ingestion run into Neo4j via the
   * GraphRepository. Re-projection is idempotent (Neo4j MERGE on
   * the canonical id). T-G.2.4 implements; this contract is the
   * T-G.2.1 placeholder.
   */
  projectIngestion(
    input: ProjectCodeGraphInput,
  ): Promise<ProjectCodeGraphResult>;
}

/**
 * Factory entry point. T-G.2.4 returns the real GraphRepository-
 * backed implementation; today it throws so callers can wire-
 * without-using during T-G.2.1.
 */
export function createCodeGraphProjection(): CodeGraphProjection {
  throw new Error(
    "[T-G.2.1] CodeGraphProjection is the T-G.2.1 interface contract only; the production implementation lands in T-G.2.4.",
  );
}
