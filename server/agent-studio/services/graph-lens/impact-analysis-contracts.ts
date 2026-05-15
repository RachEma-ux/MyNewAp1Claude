/**
 * Impact Analysis Lens contracts — Phase 24 §T-F.3.
 *
 * The Impact Analysis Lens lets operators answer "if I change X,
 * what else is affected?" Roadmap Phase 24 §"Impact Analysis Types"
 * enumerates 7 closed-taxonomy impact kinds:
 *
 *   - knowledge_impact  — affected notes, CAG blocks, KB entries
 *   - runtime_impact    — affected runtime runs, decision traces
 *   - code_impact       — affected code-graph nodes (gated on T-G.2
 *                         success); empty until then
 *   - security_impact   — affected CVE → Component → Service paths
 *   - governance_impact — affected approval steps, policies
 *   - tool_impact       — affected MCP tool registrations, dispatches
 *   - workflow_impact   — affected workflows, automation triggers
 *
 * Each kind maps (in T-F.4) to a parameterized Cypher template in
 * `ags_query_templates`. This PR ships only the closed-taxonomy +
 * request/response shape contracts.
 *
 * Permission-aware result surface: every impact result is a subgraph,
 * and every node in that subgraph carries a `visible` flag the
 * filter step writes AFTER traversal. Hidden nodes are NOT pruned
 * from the subgraph shape (the operator may need to see "X depends
 * on something you can't see" without that something being revealed)
 * — they are present-but-redacted. The lens-specific renderer
 * decides what to do with redacted nodes; the contract pins the
 * shape so the rendering layer cannot accidentally expose them.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` import. The contract is pure types.
 *   - No `dispatchMcpToolCall` / `openrouter` / `credential-resolver`.
 *   - No `process.env.*_API_KEY` reads.
 */

// ============================================================================
// Closed impact-kind taxonomy
// ============================================================================

/**
 * 7 impact kinds. Closed taxonomy — extending requires editing this
 * constant + an ADR. Mirrors roadmap §Phase 24 "Impact Analysis Types".
 */
export const IMPACT_ANALYSIS_KINDS = [
  "knowledge_impact",
  "runtime_impact",
  "code_impact",
  "security_impact",
  "governance_impact",
  "tool_impact",
  "workflow_impact",
] as const;

export type ImpactAnalysisKind = (typeof IMPACT_ANALYSIS_KINDS)[number];

export function isImpactAnalysisKind(s: unknown): s is ImpactAnalysisKind {
  return (
    typeof s === "string" &&
    (IMPACT_ANALYSIS_KINDS as readonly string[]).includes(s)
  );
}

// ============================================================================
// Request shape
// ============================================================================

export interface ImpactAnalysisRequest {
  /** Closed-taxonomy impact kind. */
  readonly kind: ImpactAnalysisKind;
  /** Starting node — operators pick this in the lens UI. */
  readonly startingNode: {
    readonly typeKey: string;
    readonly id: string;
  };
  /** Max traversal depth. Defaults to 3; max 10 (gate against
   *  pathological queries). Higher depths require approver_only
   *  governance scope on the lens. */
  readonly maxDepth?: number;
  /** Optional filter — restrict the impact set to specific node
   *  typeKeys. e.g. ["Service", "Owner"] for a security impact
   *  scoped to deployment + ownership concerns. */
  readonly nodeTypeKeyFilter?: ReadonlyArray<string>;
}

// ============================================================================
// Response shape
// ============================================================================

/**
 * One node in the impact subgraph. The `visible` flag is set by the
 * filter step AFTER traversal — `false` means the viewer's
 * permissions don't permit revealing the node's content, but the
 * shape is preserved so the operator sees that an opaque dependency
 * exists.
 */
export interface ImpactAnalysisNode {
  readonly typeKey: string;
  readonly id: string;
  /** Path distance from the starting node (0 = starting node). */
  readonly depth: number;
  /** Filter outcome — false means the renderer must show the node
   *  as redacted (e.g. greyed-out + "Hidden" label) and MUST NOT
   *  surface its display name / properties. */
  readonly visible: boolean;
  /** Display name — populated only when `visible=true`. */
  readonly label?: string;
}

/**
 * One edge in the impact subgraph. Same visibility model as nodes:
 * the edge is preserved-but-redacted if either endpoint is hidden.
 */
export interface ImpactAnalysisEdge {
  readonly typeKey: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly visible: boolean;
}

export interface ImpactAnalysisResult {
  readonly kind: ImpactAnalysisKind;
  readonly startingNodeId: string;
  readonly nodes: ReadonlyArray<ImpactAnalysisNode>;
  readonly edges: ReadonlyArray<ImpactAnalysisEdge>;
  /** True when the underlying traversal hit `maxDepth` and there
   *  may be more impact beyond what's surfaced. */
  readonly truncated: boolean;
  /** Number of nodes filtered to `visible=false`. Operator surface
   *  uses this to show "12 hidden dependencies" without revealing
   *  what they are. */
  readonly hiddenNodeCount: number;
}

// ============================================================================
// Default + max depth
// ============================================================================

export const DEFAULT_IMPACT_MAX_DEPTH = 3;
export const ABSOLUTE_IMPACT_MAX_DEPTH = 10;

/**
 * Validate + normalize `maxDepth`. Returns the clamped value (between
 * 1 and ABSOLUTE_IMPACT_MAX_DEPTH inclusive). Throws on non-finite
 * or sub-1 inputs.
 */
export function normalizeImpactMaxDepth(input: number | undefined): number {
  if (input === undefined) return DEFAULT_IMPACT_MAX_DEPTH;
  if (!Number.isFinite(input)) {
    throw new Error(
      `Impact maxDepth must be a finite number; got ${String(input)}`,
    );
  }
  if (input < 1) {
    throw new Error(
      `Impact maxDepth must be >= 1; got ${input}. Use 1 for direct-impact only.`,
    );
  }
  if (input > ABSOLUTE_IMPACT_MAX_DEPTH) return ABSOLUTE_IMPACT_MAX_DEPTH;
  return Math.floor(input);
}

// ============================================================================
// Result aggregation (T-F.10)
// ============================================================================

export interface ImpactAnalysisResultSummary {
  readonly totalNodes: number;
  readonly visibleNodes: number;
  readonly hiddenNodes: number;
  readonly totalEdges: number;
  readonly visibleEdges: number;
  readonly hiddenEdges: number;
  /** Histogram of node counts by depth (0..maxObservedDepth). Keys
   *  are depth integers; useful for "how many nodes at depth 1 vs
   *  depth 2 vs depth 3?" operator panel. Each key carries at least
   *  one node — depth values not represented in the result are NOT
   *  zeroed (depth is open-ended, not a closed taxonomy). */
  readonly nodesByDepth: Readonly<Record<number, number>>;
  /** Max depth observed in the result. 0 when no nodes; equals
   *  starting-node depth when only the anchor is present. */
  readonly maxObservedDepth: number;
  /** Passthrough of `result.truncated`. */
  readonly truncated: boolean;
}

/**
 * Aggregates an `ImpactAnalysisResult` into a stable-shape summary
 * suitable for operator dashboards. Visible / hidden counts let the
 * lens UI render "12 hidden dependencies" without revealing what
 * they are. Depth histogram supports radial-spread visualizations.
 *
 * Pure function. Does NOT mutate the input.
 */
export function summarizeImpactAnalysisResult(
  result: ImpactAnalysisResult,
): ImpactAnalysisResultSummary {
  let visibleNodes = 0;
  const nodesByDepth: Record<number, number> = {};
  let maxObservedDepth = 0;
  for (const n of result.nodes) {
    if (n.visible) visibleNodes += 1;
    nodesByDepth[n.depth] = (nodesByDepth[n.depth] ?? 0) + 1;
    if (n.depth > maxObservedDepth) maxObservedDepth = n.depth;
  }
  let visibleEdges = 0;
  for (const e of result.edges) {
    if (e.visible) visibleEdges += 1;
  }
  return {
    totalNodes: result.nodes.length,
    visibleNodes,
    hiddenNodes: result.nodes.length - visibleNodes,
    totalEdges: result.edges.length,
    visibleEdges,
    hiddenEdges: result.edges.length - visibleEdges,
    nodesByDepth,
    maxObservedDepth,
    truncated: result.truncated,
  };
}
