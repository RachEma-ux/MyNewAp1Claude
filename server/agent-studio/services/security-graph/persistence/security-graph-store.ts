/**
 * Security Graph ASDB Persistence — production interface (T-G.3.1).
 *
 * Pins the surface T-G.3.3 must implement. ASDB is the source of
 * truth for security-graph rows (CVE / SecurityFinding / Component
 * / Package / Service / Environment / Owner / CustomerExposure /
 * Policy / Control + the 8 edge types) per CLAUDE.md "Postgres =
 * source of truth; Neo4j CE = projected backend".
 *
 * Precedent (q) carry-forward: persistence owns Postgres writes;
 * projection owns Neo4j writes. The split is enforced by the
 * source-scan tests (persistence forbids `neo4j-driver`;
 * projection forbids `drizzle`).
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` import (projection lives next door).
 *   - No external network access (CVE feed lives in `cve-feed/`).
 *   - No `dispatchMcpToolCall`.
 *   - No `process.env.*_API_KEY` reads.
 */

import type {
  SecurityGraphEdgeType,
  SecurityGraphNodeType,
} from "../contracts.js";

export interface SecurityGraphNode {
  readonly id: string;
  readonly typeKey: SecurityGraphNodeType;
  readonly name: string;
  readonly properties?: Readonly<Record<string, unknown>>;
}

export interface SecurityGraphEdge {
  readonly id: string;
  readonly sourceId: string;
  readonly edgeTypeKey: SecurityGraphEdgeType;
  readonly targetId: string;
  readonly properties?: Readonly<Record<string, unknown>>;
}

export interface SecurityGraphIngestionInput {
  /** Operator-chosen stable id for this ingestion run. Typically
   *  `nvd::${ISO-timestamp}` or `${scanner-id}::${run-id}`. */
  readonly ingestionId: string;
  /** Identifies the feed source for audit + reconciliation. */
  readonly sourceKey: string;
  readonly nodes: ReadonlyArray<SecurityGraphNode>;
  readonly edges: ReadonlyArray<SecurityGraphEdge>;
}

export interface SecurityGraphIngestionResult {
  readonly ingestionId: string;
  readonly nodesUpserted: number;
  readonly edgesUpserted: number;
  /** Edges rejected by `validateSecurityGraphEdgeBatch` before
   *  reaching the DB. Same shape as T-G.2's persistence layer
   *  surfaces. */
  readonly edgesRejected: number;
}

export interface SecurityGraphStore {
  /**
   * Persist a parsed batch into ASDB. Idempotent on re-ingest of
   * the same `ingestionId` (composite-unique on
   * `(ingestion_id, node_id)` and `(ingestion_id, edge_id)` —
   * the T-G.2.3 idempotency pattern carries forward).
   */
  persistIngestion(
    input: SecurityGraphIngestionInput,
  ): Promise<SecurityGraphIngestionResult>;

  /**
   * Read all rows for a given ingestion. T-G.3.4's projection
   * reads from here so the Neo4j writes are derived.
   */
  readIngestion(ingestionId: string): Promise<{
    readonly nodes: ReadonlyArray<SecurityGraphNode>;
    readonly edges: ReadonlyArray<SecurityGraphEdge>;
  }>;
}

/**
 * Factory entry point. T-G.3.3 returns the ASDB-backed
 * implementation; today it throws so callers can wire-without-
 * using during T-G.3.1.
 */
export function createSecurityGraphStore(): SecurityGraphStore {
  throw new Error(
    "[T-G.3.1] SecurityGraphStore is the T-G.3.1 interface contract only; the production ASDB-backed implementation lands in T-G.3.3.",
  );
}
