/**
 * Code Intelligence Graph contracts — Phase 25 §T-G.2.
 *
 * Roadmap §"Phase 25 — V1.5 Expansion" enumerates 12 node types and
 * 10 edge types for the Code Intelligence Graph. This module pins
 * the closed taxonomies AHEAD of the parser spike (T-E #990) so the
 * downstream emitter PR (T-E.2) and the eventual lens-runner know
 * the canonical shape.
 *
 * Why ship contracts before the parser:
 *   - The taxonomies are stable irrespective of which parser
 *     strategy wins T-E. Whether tree-sitter or a per-language AST
 *     tool emits the nodes, the SHAPE is the same.
 *   - Locking the shape now means T-E.2's emitter has a fixed
 *     target to write against.
 *   - The Cypher query templates for code-graph impact analysis
 *     (T-F.7 with `code_impact` IA kind from #993) can reference
 *     these typeKeys at registration time.
 *
 * The spike target directory remains `services/code-graph/spike/`
 * (#990); these contracts live in `services/code-graph/contracts/`
 * so they're outside the spike-boundary source-scan and available
 * to other modules.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure types. No DB I/O. No graph mutation.
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - No `tree-sitter` import (the parser code lives in the spike
 *     directory; this contract is parser-agnostic).
 */

// ============================================================================
// Closed taxonomy — 12 code-graph node types
// ============================================================================

export const CODE_GRAPH_NODE_TYPES = [
  "repository",
  "package",
  "file",
  "class",
  "function",
  "method",
  "api_endpoint",
  "service",
  "db_table",
  "frontend_component",
  "config_file",
  "test_file",
] as const;

export type CodeGraphNodeType = (typeof CODE_GRAPH_NODE_TYPES)[number];

export function isCodeGraphNodeType(s: unknown): s is CodeGraphNodeType {
  return (
    typeof s === "string" &&
    (CODE_GRAPH_NODE_TYPES as readonly string[]).includes(s)
  );
}

// ============================================================================
// Closed taxonomy — 10 code-graph edge types
// ============================================================================

export const CODE_GRAPH_EDGE_TYPES = [
  "imports",
  "calls",
  "declares",
  "implements",
  "depends_on",
  "reads_from_table",
  "writes_to_table",
  "routes_to",
  "renders_component",
  "tests",
] as const;

export type CodeGraphEdgeType = (typeof CODE_GRAPH_EDGE_TYPES)[number];

export function isCodeGraphEdgeType(s: unknown): s is CodeGraphEdgeType {
  return (
    typeof s === "string" &&
    (CODE_GRAPH_EDGE_TYPES as readonly string[]).includes(s)
  );
}

// ============================================================================
// Edge cardinality + endpoint-typeKey constraints
// ============================================================================

export interface CodeGraphEdgeConstraint {
  /** Closed-taxonomy source-node typeKey(s) the edge is allowed
   *  to originate from. Empty = any. */
  readonly sourceTypeKeys: ReadonlyArray<CodeGraphNodeType>;
  /** Closed-taxonomy target-node typeKey(s) the edge is allowed
   *  to point to. Empty = any. */
  readonly targetTypeKeys: ReadonlyArray<CodeGraphNodeType>;
  /** Cardinality hint — the lens-runner uses this to pick a
   *  default layout (one-to-many → tree; many-to-many → matrix). */
  readonly cardinality: "one_to_one" | "one_to_many" | "many_to_many";
}

export const CODE_GRAPH_EDGE_CONSTRAINTS: Readonly<
  Record<CodeGraphEdgeType, CodeGraphEdgeConstraint>
> = {
  imports: {
    sourceTypeKeys: ["file"],
    targetTypeKeys: ["file", "package"],
    cardinality: "many_to_many",
  },
  calls: {
    sourceTypeKeys: ["function", "method"],
    targetTypeKeys: ["function", "method", "api_endpoint"],
    cardinality: "many_to_many",
  },
  declares: {
    sourceTypeKeys: ["file"],
    targetTypeKeys: ["class", "function", "api_endpoint"],
    cardinality: "one_to_many",
  },
  implements: {
    sourceTypeKeys: ["class"],
    targetTypeKeys: ["class"],
    cardinality: "many_to_many",
  },
  depends_on: {
    sourceTypeKeys: ["package", "service"],
    targetTypeKeys: ["package", "service"],
    cardinality: "many_to_many",
  },
  reads_from_table: {
    sourceTypeKeys: ["function", "method"],
    targetTypeKeys: ["db_table"],
    cardinality: "many_to_many",
  },
  writes_to_table: {
    sourceTypeKeys: ["function", "method"],
    targetTypeKeys: ["db_table"],
    cardinality: "many_to_many",
  },
  routes_to: {
    sourceTypeKeys: ["api_endpoint"],
    targetTypeKeys: ["function", "method"],
    cardinality: "one_to_many",
  },
  renders_component: {
    sourceTypeKeys: ["frontend_component"],
    targetTypeKeys: ["frontend_component"],
    cardinality: "many_to_many",
  },
  tests: {
    sourceTypeKeys: ["test_file"],
    targetTypeKeys: ["file", "function", "method", "class", "api_endpoint"],
    cardinality: "many_to_many",
  },
};

// ============================================================================
// Validation helpers
// ============================================================================

/**
 * Validate that a (sourceTypeKey, edgeTypeKey, targetTypeKey) triple
 * is allowed by the closed taxonomy + per-edge constraints. Returns
 * `true` when valid; `false` otherwise. Used by the eventual
 * emitter to reject malformed projections at write time.
 */
export function isAllowedCodeGraphEdge(
  sourceTypeKey: CodeGraphNodeType,
  edgeTypeKey: CodeGraphEdgeType,
  targetTypeKey: CodeGraphNodeType,
): boolean {
  const c = CODE_GRAPH_EDGE_CONSTRAINTS[edgeTypeKey];
  // Empty sourceTypeKeys / targetTypeKeys = "any" — but currently
  // every edge declares concrete endpoints. Defensive code retains
  // the "any" semantics for future flexibility.
  const sourceOk =
    c.sourceTypeKeys.length === 0 || c.sourceTypeKeys.includes(sourceTypeKey);
  const targetOk =
    c.targetTypeKeys.length === 0 || c.targetTypeKeys.includes(targetTypeKey);
  return sourceOk && targetOk;
}

/**
 * Returns the closed-taxonomy edges the given source typeKey is
 * allowed to originate. Useful for the lens UI's "what can I add
 * from this node" picker.
 */
export function listAllowedEdgeTypesFromSource(
  sourceTypeKey: CodeGraphNodeType,
): ReadonlyArray<CodeGraphEdgeType> {
  return CODE_GRAPH_EDGE_TYPES.filter((edge) => {
    const c = CODE_GRAPH_EDGE_CONSTRAINTS[edge];
    return c.sourceTypeKeys.length === 0 || c.sourceTypeKeys.includes(sourceTypeKey);
  });
}

/**
 * Returns the closed-taxonomy edges that may terminate at the given
 * target typeKey. Symmetric helper for endpoint-aware picker UIs.
 */
export function listAllowedEdgeTypesToTarget(
  targetTypeKey: CodeGraphNodeType,
): ReadonlyArray<CodeGraphEdgeType> {
  return CODE_GRAPH_EDGE_TYPES.filter((edge) => {
    const c = CODE_GRAPH_EDGE_CONSTRAINTS[edge];
    return c.targetTypeKeys.length === 0 || c.targetTypeKeys.includes(targetTypeKey);
  });
}

// ============================================================================
// Reason-bearing batch validation
// ============================================================================

export type CodeGraphEdgeValidationReason =
  | "unknown_source_type"
  | "unknown_edge_type"
  | "unknown_target_type"
  | "source_type_not_allowed_for_edge"
  | "target_type_not_allowed_for_edge";

export type CodeGraphEdgeValidationOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: CodeGraphEdgeValidationReason };

/**
 * Validates a single edge triple and returns either `{ ok: true }`
 * or `{ ok: false, reason }` so the emitter can log a structured
 * failure (rather than throwing or returning a bare boolean). The
 * reason enum is closed — extending it requires editing this module
 * and adding test coverage.
 *
 * The inputs are `string` (not `CodeGraphNodeType` / `CodeGraphEdgeType`)
 * because callers are typically parsers / projections that have
 * untyped strings from upstream. The first three checks act as
 * type guards.
 */
export function validateCodeGraphEdgeWithReason(
  sourceTypeKey: string,
  edgeTypeKey: string,
  targetTypeKey: string,
): CodeGraphEdgeValidationOutcome {
  if (!isCodeGraphNodeType(sourceTypeKey)) {
    return { ok: false, reason: "unknown_source_type" };
  }
  if (!isCodeGraphEdgeType(edgeTypeKey)) {
    return { ok: false, reason: "unknown_edge_type" };
  }
  if (!isCodeGraphNodeType(targetTypeKey)) {
    return { ok: false, reason: "unknown_target_type" };
  }
  const c = CODE_GRAPH_EDGE_CONSTRAINTS[edgeTypeKey];
  const sourceOk =
    c.sourceTypeKeys.length === 0 || c.sourceTypeKeys.includes(sourceTypeKey);
  if (!sourceOk) {
    return { ok: false, reason: "source_type_not_allowed_for_edge" };
  }
  const targetOk =
    c.targetTypeKeys.length === 0 || c.targetTypeKeys.includes(targetTypeKey);
  if (!targetOk) {
    return { ok: false, reason: "target_type_not_allowed_for_edge" };
  }
  return { ok: true };
}

export interface CodeGraphEdgeBatchInput {
  readonly sourceTypeKey: string;
  readonly edgeTypeKey: string;
  readonly targetTypeKey: string;
  /** Stable id (caller-provided) so the rejection map can be joined
   *  back to the caller's row identity. */
  readonly edgeId: string;
}

export interface CodeGraphEdgeBatchResult {
  readonly acceptedEdgeIds: ReadonlyArray<string>;
  readonly rejected: ReadonlyArray<{
    readonly edgeId: string;
    readonly reason: CodeGraphEdgeValidationReason;
  }>;
  /** Count of rejections per reason — for emitter dashboards / logs. */
  readonly rejectionsByReason: Readonly<
    Record<CodeGraphEdgeValidationReason, number>
  >;
}

/**
 * Bulk-validates a batch of edges. The future emitter (T-E.2) calls
 * this once per parser pass and writes only the accepted rows;
 * `rejectionsByReason` becomes the structured failure counter for
 * operator dashboards.
 */
export function validateCodeGraphEdgeBatch(
  edges: ReadonlyArray<CodeGraphEdgeBatchInput>,
): CodeGraphEdgeBatchResult {
  const accepted: string[] = [];
  const rejected: Array<{
    edgeId: string;
    reason: CodeGraphEdgeValidationReason;
  }> = [];
  const rejectionsByReason: Record<CodeGraphEdgeValidationReason, number> = {
    unknown_source_type: 0,
    unknown_edge_type: 0,
    unknown_target_type: 0,
    source_type_not_allowed_for_edge: 0,
    target_type_not_allowed_for_edge: 0,
  };
  for (const e of edges) {
    const outcome = validateCodeGraphEdgeWithReason(
      e.sourceTypeKey,
      e.edgeTypeKey,
      e.targetTypeKey,
    );
    if (outcome.ok) {
      accepted.push(e.edgeId);
    } else {
      rejected.push({ edgeId: e.edgeId, reason: outcome.reason });
      rejectionsByReason[outcome.reason]++;
    }
  }
  return {
    acceptedEdgeIds: accepted,
    rejected,
    rejectionsByReason,
  };
}
