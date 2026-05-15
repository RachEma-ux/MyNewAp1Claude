/**
 * Graph Lens contracts — Phase 24 §T-F.1 (remaining execution plan).
 *
 * A Lens is a named, governance-scoped, layout-tagged view onto the
 * graph. Lenses let operators see the same underlying graph from
 * different angles — "RAG view" filters to retrieval-bound nodes;
 * "Governance view" surfaces approval-bound nodes; "Runtime view"
 * surfaces trace + decision-trace nodes; etc.
 *
 * Lens KINDS are closed taxonomy (8 values, matching roadmap §"Phase
 * 24 — Full V1 Expansion"). Individual lens REGISTRATIONS carry a
 * `kind` (closed) + a registrant-supplied id (open), so multiple
 * lenses of the same kind can coexist (e.g. two different RAG views
 * for two different retrieval pipelines).
 *
 * The registry is the load-bearing primitive — Phase 24 §T-F.2
 * (Bases MVP), T-F.3 (Impact Analysis Lens), T-F.4 (Quality Lens),
 * and T-F.5 (Runtime / Decision-Trace Lens) all hang off this.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` import in this file. Lens definitions
 *     declare what to query; execution flows through
 *     `services/graph/repository/**`.
 *   - No `dispatchMcpToolCall` / `openrouter` / `credential-resolver`
 *     imports. Lenses are a read-only projection abstraction.
 */

// ============================================================================
// Closed lens-kind taxonomy
// ============================================================================

/**
 * 8 lens kinds. Closed taxonomy — extending requires editing this
 * constant + an ADR. Mirrors roadmap §"Phase 24" Lens enumeration.
 */
export const GRAPH_LENS_KINDS = [
  "rag",
  "rac",
  "cag",
  "graph_skill",
  "mcp",
  "governance",
  "runtime",
  "institutional_memory",
] as const;

export type GraphLensKind = (typeof GRAPH_LENS_KINDS)[number];

export function isGraphLensKind(s: unknown): s is GraphLensKind {
  return (
    typeof s === "string" &&
    (GRAPH_LENS_KINDS as readonly string[]).includes(s)
  );
}

// ============================================================================
// Lens layout taxonomy
// ============================================================================

/**
 * Closed layout taxonomy. Lenses can request a preferred layout
 * shape; the UI may override based on result size, but the lens
 * declares what's idiomatic for its content.
 */
export const GRAPH_LENS_LAYOUTS = [
  "force_directed",
  "tree",
  "matrix",
  "timeline",
  "dependency_path",
] as const;

export type GraphLensLayout = (typeof GRAPH_LENS_LAYOUTS)[number];

// ============================================================================
// Governance scope
// ============================================================================

/**
 * Closed governance-scope taxonomy. Defines which actor can see the
 * lens output. Mirrors the existing approval scaffolding scope model.
 */
export const GRAPH_LENS_GOVERNANCE_SCOPES = [
  "workspace_public",
  "workspace_members",
  "approver_only",
  "admin_only",
] as const;

export type GraphLensGovernanceScope =
  (typeof GRAPH_LENS_GOVERNANCE_SCOPES)[number];

// ============================================================================
// Lens definition
// ============================================================================

/**
 * A single lens registration. The `id` is registrant-supplied and
 * must be unique within the registry — two lenses with the same id
 * is an error.
 */
export interface GraphLensDefinition {
  /** Stable identifier. e.g. `rag_default` / `rag_legal_only` */
  readonly id: string;
  /** Closed-taxonomy kind. */
  readonly kind: GraphLensKind;
  /** Human-readable label rendered in the lens browser. */
  readonly label: string;
  /** Preferred layout. UI may override based on result-size heuristics. */
  readonly layout: GraphLensLayout;
  /** Governance scope. The lens query is permission-post-filtered
   *  by viewer regardless of this value — this controls UI visibility
   *  of the LENS ITSELF, not its results. */
  readonly governanceScope: GraphLensGovernanceScope;
  /** Optional short description for the lens browser. */
  readonly description?: string;
}

// ============================================================================
// Registry errors
// ============================================================================

export class GraphLensIdAlreadyRegisteredError extends Error {
  constructor(id: string) {
    super(`A graph lens with id="${id}" is already registered.`);
    this.name = "GraphLensIdAlreadyRegisteredError";
  }
}

export class GraphLensNotFoundError extends Error {
  constructor(id: string) {
    super(`No graph lens registered with id="${id}".`);
    this.name = "GraphLensNotFoundError";
  }
}
