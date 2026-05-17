/**
 * Code Graph ASDB Persistence — production interface (T-G.2.1).
 *
 * Pins the surface T-G.2.3 must implement. ASDB is the source of
 * truth for code-graph symbols (per CLAUDE.md "Postgres = source of
 * truth; Neo4j CE = projected backend"). The Neo4j projection
 * (`projection/`) reads from this store; lens runners (T-G.2.5)
 * query via the GraphRepository which is fed from this store.
 *
 * Why a separate `persistence/` rather than the existing
 * `services/graph/repository/`:
 *   - `services/graph/repository/` is the cross-cutting graph
 *     access surface for the whole Native Graph Workspace — not
 *     specific to code-graph.
 *   - Code-graph has domain-specific concerns (file-rooted ids,
 *     re-ingestion idempotency, parser-error tolerance) that
 *     shouldn't leak into the generic GraphRepository contract.
 *   - The store calls the generic GraphRepository under the hood
 *     once T-G.2.3 implements it; this is the code-graph-shaped
 *     facade.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No direct `drizzle` import here (T-G.2.3 wires through the
 *     repository pattern; this file is interface-only).
 *   - No `neo4j-driver` import (projection lives next door).
 *   - No `dispatchMcpToolCall`.
 *   - Postgres = source of truth — every upsert path here returns
 *     before any Neo4j write happens.
 */

import type {
  ParsedCodeNode,
  ParsedCodeEdge,
  ParseError,
} from "../parser/code-graph-parser.js";

/**
 * One ingestion run = one repo-scan invocation. The store
 * idempotently upserts symbols keyed by `(ingestionId, node.id)` so
 * re-ingest doesn't duplicate. T-G.2.3 generates `ingestionId` per
 * run.
 */
export interface CodeGraphIngestionInput {
  readonly ingestionId: string;
  readonly repositoryId: string;
  readonly nodes: ReadonlyArray<ParsedCodeNode>;
  readonly edges: ReadonlyArray<ParsedCodeEdge>;
  readonly errors: ReadonlyArray<ParseError>;
}

export interface CodeGraphIngestionResult {
  readonly ingestionId: string;
  readonly nodesUpserted: number;
  readonly edgesUpserted: number;
  /** Edges rejected because (sourceTypeKey, edgeTypeKey, targetTypeKey)
   *  is not in the closed-taxonomy edge-constraint registry. The
   *  store calls `validateCodeGraphEdgeBatch` before persisting. */
  readonly edgesRejected: number;
  /** Surfaced verbatim from the parser. The store does not
   *  persist these — they're audit-trail telemetry for the
   *  orchestrator. */
  readonly parserErrorCount: number;
}

export interface CodeGraphStore {
  /**
   * Persist a parsed batch into ASDB. Idempotent on re-ingest of
   * the same `ingestionId`. The store applies the closed-taxonomy
   * edge validation (`validateCodeGraphEdgeBatch`) before writing
   * so malformed edges never reach the DB.
   */
  persistIngestion(
    input: CodeGraphIngestionInput,
  ): Promise<CodeGraphIngestionResult>;

  /**
   * Read all symbols for a given ingestion run. T-G.2.4's
   * projection reads from here so the Neo4j writes are derived
   * (not authoritative).
   */
  readIngestion(ingestionId: string): Promise<{
    readonly nodes: ReadonlyArray<ParsedCodeNode>;
    readonly edges: ReadonlyArray<ParsedCodeEdge>;
  }>;
}

/**
 * Factory entry point. T-G.2.3 returns the real ASDB-backed
 * implementation; today it throws so callers can wire-without-using
 * during T-G.2.1.
 */
export function createCodeGraphStore(): CodeGraphStore {
  throw new Error(
    "[T-G.2.1] CodeGraphStore is the T-G.2.1 interface contract only; the production implementation lands in T-G.2.3.",
  );
}
