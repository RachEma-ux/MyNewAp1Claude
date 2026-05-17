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
 * 10 lens kinds. Closed taxonomy — extending requires editing this
 * constant + an ADR. Mirrors roadmap §"Phase 24" Lens enumeration:
 *   - 8 original kinds (rag/rac/cag/graph_skill/mcp/governance/
 *     runtime/institutional_memory)
 *   - +code_intelligence (T-G.2.5 — Code Intelligence Graph)
 *   - +security_devsecops (T-G.3.5 — Security/DevSecOps Graph
 *     Lens; approver_only scope because security findings are
 *     not workspace-public)
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
  "code_intelligence",
  "security_devsecops",
] as const;

export type GraphLensKind = (typeof GRAPH_LENS_KINDS)[number];

export function isGraphLensKind(s: unknown): s is GraphLensKind {
  return (
    typeof s === "string" &&
    (GRAPH_LENS_KINDS as readonly string[]).includes(s)
  );
}

// ============================================================================
// Per-kind operator-facing metadata (T-F.13)
// ============================================================================

export interface GraphLensKindMetadata {
  /** Display label rendered in operator-side lens browsers. */
  readonly label: string;
  /** Short description for hover tooltips / help text. */
  readonly description: string;
}

export const GRAPH_LENS_KIND_METADATA: Readonly<
  Record<GraphLensKind, GraphLensKindMetadata>
> = {
  rag: {
    label: "RAG",
    description:
      "Retrieval-Augmented Generation surface — what knowledge sources answer this question.",
  },
  rac: {
    label: "RAC",
    description:
      "Retrieval + Assembly + Compilation — the runtime context assembly view.",
  },
  cag: {
    label: "CAG",
    description:
      "Capability Packs — compiled context blocks and their provenance.",
  },
  graph_skill: {
    label: "Graph Skills",
    description:
      "Reusable graph traversal skill packs and their usage history.",
  },
  mcp: {
    label: "MCP Tools",
    description:
      "MCP tool dispatch graph — which tools call which, with risk class overlay.",
  },
  governance: {
    label: "Governance",
    description:
      "Approval, permission, and policy graph — who can do what, and what's been approved.",
  },
  runtime: {
    label: "Runtime",
    description:
      "Live agent runtime runs and their state transitions.",
  },
  institutional_memory: {
    label: "Institutional Memory",
    description:
      "People / teams / decisions / policies — the organizational graph.",
  },
  code_intelligence: {
    label: "Code Intelligence",
    description:
      "Code graph — files, classes, functions, API endpoints + import/call/declares relationships parsed from this repo via tree-sitter (T-G.2).",
  },
  security_devsecops: {
    label: "Security / DevSecOps",
    description:
      "CVE → Package → Component → Service → Environment → Owner → CustomerExposure impact graph (T-G.3). Approver-only because security findings are not workspace-public.",
  },
};

export function getGraphLensKindMetadata(
  kind: GraphLensKind,
): GraphLensKindMetadata {
  return GRAPH_LENS_KIND_METADATA[kind];
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
// Per-layout operator-facing metadata (T-F.15)
// ============================================================================

export interface GraphLensLayoutMetadata {
  /** Display label rendered in lens-browser layout pickers. */
  readonly label: string;
  /** Short description of what this layout is good for. */
  readonly description: string;
}

export const GRAPH_LENS_LAYOUT_METADATA: Readonly<
  Record<GraphLensLayout, GraphLensLayoutMetadata>
> = {
  force_directed: {
    label: "Force-Directed",
    description:
      "Physics-based spring layout — best for general exploratory views of mid-size graphs.",
  },
  tree: {
    label: "Tree",
    description:
      "Hierarchical top-down or radial tree — best for one-to-many relationships (declares, imports).",
  },
  matrix: {
    label: "Matrix",
    description:
      "Adjacency matrix — best for dense many-to-many graphs where edge crossings would obscure the structure.",
  },
  timeline: {
    label: "Timeline",
    description:
      "Time-anchored horizontal layout — best for runtime runs, decisions, and ordered events.",
  },
  dependency_path: {
    label: "Dependency Path",
    description:
      "Linear path layout — best for traceability views (CVE → package → component → service).",
  },
};

export function getGraphLensLayoutMetadata(
  layout: GraphLensLayout,
): GraphLensLayoutMetadata {
  return GRAPH_LENS_LAYOUT_METADATA[layout];
}

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
// Per-governance-scope operator-facing metadata (T-F.16)
// ============================================================================

export interface GraphLensGovernanceScopeMetadata {
  /** Display label rendered in lens-browser permission overlays. */
  readonly label: string;
  /** Short description of who can see this scope. */
  readonly description: string;
  /** Closed taxonomy: how restrictive the scope is, ordered narrow→broad. */
  readonly restrictiveness: "open" | "members_only" | "approvers_only" | "admin_only";
}

export const GRAPH_LENS_GOVERNANCE_SCOPE_METADATA: Readonly<
  Record<GraphLensGovernanceScope, GraphLensGovernanceScopeMetadata>
> = {
  workspace_public: {
    label: "Workspace Public",
    description:
      "Visible to anyone with workspace access — least restrictive. Suitable for shared lenses without sensitive content.",
    restrictiveness: "open",
  },
  workspace_members: {
    label: "Workspace Members",
    description:
      "Visible only to authenticated workspace members. Excludes guests and public viewers.",
    restrictiveness: "members_only",
  },
  approver_only: {
    label: "Approvers Only",
    description:
      "Visible only to members with approver role. For lenses operating on governance-sensitive content.",
    restrictiveness: "approvers_only",
  },
  admin_only: {
    label: "Admin Only",
    description:
      "Visible only to workspace admins. Most restrictive — for system-level / audit / debugging lenses.",
    restrictiveness: "admin_only",
  },
};

export function getGraphLensGovernanceScopeMetadata(
  scope: GraphLensGovernanceScope,
): GraphLensGovernanceScopeMetadata {
  return GRAPH_LENS_GOVERNANCE_SCOPE_METADATA[scope];
}

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
