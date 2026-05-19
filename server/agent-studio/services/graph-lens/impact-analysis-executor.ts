/**
 * Impact Analysis executor.
 *
 * Two-mode executor:
 *   - **Stub mode** (`runImpactAnalysisStub`) — returns an anchor-only
 *     result. Used as the fallback for kinds without a registered
 *     Cypher template + by unit tests that don't need a graph.
 *   - **Template mode** (`runImpactAnalysisViaTemplate`) — slice 29
 *     of the no-deferral continuation catalogue (2026-05-19) wires
 *     this for kinds present in `IMPACT_ANALYSIS_TEMPLATES`. Calls
 *     `GraphRepository.executeTemplate(...)` with the kind's
 *     parameterized Cypher template and maps the result rows.
 *
 * `classifyImpactAnalysisExecutorMode(kind)` returns `"template"` when
 * a template is registered for the kind, otherwise `"stub"`.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` import. The template-mode executor reaches
 *     Neo4j via `GraphRepository.executeTemplate(...)`.
 *   - No `dispatchMcpToolCall` / `openrouter` / `credential-resolver`.
 *   - No `process.env.*_API_KEY` reads.
 *   - Templates are read-only by hard rule (the `ags_query_templates`
 *     `read_only` column is `true` for every registered template).
 */

import {
  normalizeImpactMaxDepth,
  type ImpactAnalysisKind,
  type ImpactAnalysisRequest,
  type ImpactAnalysisResult,
} from "./impact-analysis-contracts.js";
import {
  findImpactAnalysisTemplate,
  hasImpactAnalysisTemplate,
} from "./impact-analysis-templates.js";
import type { GraphRepository, RuntimeContext } from "../graph/repository/types.js";

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
 * Per-kind mode classifier. Returns one of:
 *   - `stub` — no template registered for this kind; result is
 *     anchor-only.
 *   - `template` — a parameterized Cypher template is registered
 *     in `IMPACT_ANALYSIS_TEMPLATES`. The executor routes through
 *     `GraphRepository.executeTemplate(...)`.
 *
 * Exposed so the operator dashboard can render a "Stub mode — no
 * template registered" badge per kind in the impact-analysis
 * picker. Important UX signal so operators don't assume an
 * anchor-only result means "no impact" when the truth is "we
 * haven't authored a Cypher template for this kind yet."
 */
export function classifyImpactAnalysisExecutorMode(
  kind: ImpactAnalysisKind,
): "stub" | "template" {
  return hasImpactAnalysisTemplate(kind) ? "template" : "stub";
}

/**
 * Template-mode executor. Calls `GraphRepository.executeTemplate(...)`
 * with the kind's parameterized Cypher template and maps the result
 * rows back into the `ImpactAnalysisResult` shape.
 *
 * Falls back to the anchor-only stub on:
 *   - No template registered for the kind (defense-in-depth — the
 *     router should call this only when `classifyImpactAnalysisExecutorMode`
 *     returns `"template"`).
 *   - Template-execution throws (the failure surfaces to the operator
 *     UI as an empty-impact result; the underlying error is logged).
 */
export async function runImpactAnalysisViaTemplate(
  request: ImpactAnalysisRequest,
  deps: {
    readonly repository: GraphRepository;
    readonly runtime: RuntimeContext;
  },
): Promise<ImpactAnalysisResult> {
  // Normalize maxDepth — throws on invalid input per the contract.
  void normalizeImpactMaxDepth(request.maxDepth);

  const template = findImpactAnalysisTemplate(request.kind);
  if (!template) return runImpactAnalysisStub(request);

  try {
    const params = template.buildParameters(request);
    const result = await deps.repository.executeTemplate({
      templateKey: template.templateKey,
      parameters: params,
      runtime: deps.runtime,
    });
    const { nodes, edges } = template.mapRows(result.rows, request);
    return {
      kind: request.kind,
      startingNodeId: request.startingNode.id,
      nodes,
      edges,
      truncated: result.truncated,
      hiddenNodeCount: 0,
    };
  } catch (err) {
    console.warn(
      `[impact-analysis] template execution failed for kind=${request.kind}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return runImpactAnalysisStub(request);
  }
}
