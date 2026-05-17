/**
 * Impact Analysis executor — stub implementation (T-G.5.β).
 *
 * Plumbs the executor surface so the operator dashboard can wire up
 * to `runImpactAnalysis(kind, startingNode)` today. **This stub does
 * not traverse the graph** — it returns an anchor-only result for
 * every kind.
 *
 * Why ship a stub before the real templates:
 *   1. The dashboard wiring (component → tRPC procedure → response
 *      shape) can land in parallel with the Cypher-template
 *      authoring. Without the stub, the dashboard work blocks on
 *      every kind getting a template.
 *   2. The response shape is already locked by T-F.3's
 *      `ImpactAnalysisResult` contract. The stub honors that
 *      contract exactly; future template-backed executors slot in
 *      without dashboard-side changes.
 *   3. The permission-filter pattern (T-F.3's `visible:false`
 *      preservation) is exercised by the stub even though there's
 *      nothing to filter — the contract path is tested.
 *
 * Future template-backed executor:
 *   - For each `ImpactAnalysisKind`, register a parameterized Cypher
 *     template in `ags_query_templates` (T-F.4 work).
 *   - Replace the stub's "return anchor only" branch with
 *     `GraphRepository.executeTemplate({ templateKey, params })`.
 *   - Apply the permission filter (T-F.3's `visible:false` shape)
 *     to the result.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` import. The future template-backed executor
 *     reaches Neo4j via `GraphRepository.executeTemplate(...)`.
 *   - No `dispatchMcpToolCall` / `openrouter` / `credential-resolver`.
 *   - No `process.env.*_API_KEY` reads.
 */

import {
  normalizeImpactMaxDepth,
  type ImpactAnalysisKind,
  type ImpactAnalysisRequest,
  type ImpactAnalysisResult,
} from "./impact-analysis-contracts.js";

// ============================================================================
// Stub executor
// ============================================================================

/**
 * Returns an anchor-only `ImpactAnalysisResult` for any
 * `ImpactAnalysisRequest`. Honors the contract:
 *
 *   - `nodes[0]` = the starting node, `depth:0`, `visible:true`
 *   - `edges` = []
 *   - `truncated` = false
 *   - `hiddenNodeCount` = 0
 *
 * The `maxDepth` input is still normalized (so the kind-router can
 * report a "would-traverse-to-depth-N" hint in operator UI even
 * before templates are authored). `nodeTypeKeyFilter` is recorded
 * in the result for future template-aware filtering — the stub
 * doesn't apply it.
 */
export function runImpactAnalysisStub(
  request: ImpactAnalysisRequest,
): ImpactAnalysisResult {
  // Normalize maxDepth — throws on invalid input per the contract.
  // We don't actually use it (stub doesn't traverse) but validating
  // here lets the operator know the input is well-formed before
  // they try a template-backed run.
  void normalizeImpactMaxDepth(request.maxDepth);

  // Always start with the anchor as a visible node at depth 0.
  return {
    kind: request.kind,
    startingNodeId: request.startingNode.id,
    nodes: [
      {
        typeKey: request.startingNode.typeKey,
        id: request.startingNode.id,
        depth: 0,
        visible: true,
        // Label intentionally omitted — the stub doesn't know
        // the anchor's display name (no graph query was run).
        // Operators rendering an anchor-only result can fall back
        // to the id.
      },
    ],
    edges: [],
    truncated: false,
    hiddenNodeCount: 0,
  };
}

/**
 * Per-kind stub mode classifier. Returns one of:
 *   - `stub` — the executor has no template registered for this
 *     kind; result is anchor-only.
 *   - `template` — a parameterized Cypher template is registered
 *     and the executor would run it (future state — always `stub`
 *     today since no templates are seeded).
 *
 * Exposed so the operator dashboard can render a "Stub mode — no
 * template registered" badge per kind in the impact-analysis
 * picker. Important UX signal so operators don't assume an
 * anchor-only result means "no impact" when the truth is "we
 * haven't authored a Cypher template for this kind yet."
 */
export function classifyImpactAnalysisExecutorMode(
  _kind: ImpactAnalysisKind,
): "stub" | "template" {
  // Today: always stub. When templates land in T-F.4, this returns
  // "template" for kinds with seeded entries in
  // `ags_query_templates`.
  return "stub";
}
