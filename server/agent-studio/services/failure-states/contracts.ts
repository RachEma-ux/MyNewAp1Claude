/**
 * Phase 22 Failure-State Closed Taxonomy — T-I.3.
 *
 * Roadmap §"Phase 22 — User Feedback and Failure-State Implementation"
 * enumerates 25 failure states. This module pins them as a closed
 * taxonomy + categorizes each by:
 *
 *   - `category` — coarse grouping for operator dashboard tabs:
 *     `infrastructure` / `governance` / `retrieval` / `agent` /
 *     `runtime`
 *   - `severity` — default suggested operator-attention level
 *     (info / warning / critical)
 *   - `recoverable` — whether the system can self-recover (retry,
 *     fallback) vs requires explicit operator action
 *
 * The taxonomy is closed — extending requires editing this constant
 * AND adding an ADR for the new state's recovery semantics.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure types. No DB I/O. No graph mutation.
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 */

// ============================================================================
// Closed taxonomy — 25 failure states
// ============================================================================

export const FAILURE_STATES = [
  "promotion_failed",
  "note_conflict",
  "entity_resolution_conflict",
  "neo4j_unavailable",
  "neo4j_degraded",
  "neo4j_query_timeout",
  "neo4j_projection_stale",
  "neo4j_projection_drift_detected",
  "projection_sync_failed",
  "graph_query_timeout",
  "backlink_refresh_failed",
  "runtime_reference_hidden_by_permission",
  "cag_reference_invalidated",
  "graph_skill_reference_invalidated",
  "tool_schema_changed",
  "search_index_stale",
  "query_cache_stale",
  "text2cypher_rejected",
  "cypher_query_template_failed",
  "retrieval_safety_filter_blocked_content",
  "graph_agent_answer_incomplete",
  "golden_question_failed",
  "graph_correction_rejected",
  "semantic_enrichment_rejected",
  "background_job_failed",
] as const;

export type FailureState = (typeof FAILURE_STATES)[number];

export function isFailureState(s: unknown): s is FailureState {
  return (
    typeof s === "string" &&
    (FAILURE_STATES as readonly string[]).includes(s)
  );
}

// ============================================================================
// Category taxonomy
// ============================================================================

export const FAILURE_STATE_CATEGORIES = [
  "infrastructure",
  "governance",
  "retrieval",
  "agent",
  "runtime",
] as const;

export type FailureStateCategory = (typeof FAILURE_STATE_CATEGORIES)[number];

// ============================================================================
// Per-category operator-facing metadata (T-I.31)
// ============================================================================

export interface FailureStateCategoryMetadata {
  /** Display label for operator dashboard tabs. */
  readonly label: string;
  /** Short description of what failures belong in this category. */
  readonly description: string;
}

export const FAILURE_STATE_CATEGORY_METADATA: Readonly<
  Record<FailureStateCategory, FailureStateCategoryMetadata>
> = {
  infrastructure: {
    label: "Infrastructure",
    description:
      "Backend / database / projection failures — Neo4j unavailable, projection drift, sync errors.",
  },
  governance: {
    label: "Governance",
    description:
      "Approval / permission / policy-related failures — promotion rejection, schema changes, permission-hidden references.",
  },
  retrieval: {
    label: "Retrieval",
    description:
      "Knowledge retrieval pipeline failures — text2cypher rejection, query template errors, safety-filter blocks.",
  },
  agent: {
    label: "Agent",
    description:
      "Agent runtime failures — budget exhaustion, golden-question failures, planner errors.",
  },
  runtime: {
    label: "Runtime",
    description:
      "Background job / scheduled task failures — note conflicts, background job failures, backlink refresh errors.",
  },
};

export function getFailureStateCategoryMetadata(
  category: FailureStateCategory,
): FailureStateCategoryMetadata {
  return FAILURE_STATE_CATEGORY_METADATA[category];
}

// ============================================================================
// Severity taxonomy
// ============================================================================

export const FAILURE_STATE_SEVERITIES = [
  "info",
  "warning",
  "critical",
] as const;

export type FailureStateSeverity = (typeof FAILURE_STATE_SEVERITIES)[number];

// ============================================================================
// Per-severity operator-facing metadata (T-I.32)
// ============================================================================

export interface FailureStateSeverityMetadata {
  /** Display label for operator dashboards. */
  readonly label: string;
  /** Short description of operator response expectation. */
  readonly description: string;
  /** Stable operator-action expectation: "monitor" / "investigate" /
   *  "escalate". Drives UI urgency badges. */
  readonly operatorAction: "monitor" | "investigate" | "escalate";
}

export const FAILURE_STATE_SEVERITY_METADATA: Readonly<
  Record<FailureStateSeverity, FailureStateSeverityMetadata>
> = {
  info: {
    label: "Info",
    description:
      "Non-actionable event of operator interest — degraded states, recovered conditions, throttle activations.",
    operatorAction: "monitor",
  },
  warning: {
    label: "Warning",
    description:
      "Recoverable failure that needs investigation if it recurs — drift detected, partial blockages, single-incident outages.",
    operatorAction: "investigate",
  },
  critical: {
    label: "Critical",
    description:
      "Non-recoverable failure requiring immediate operator action — backend unavailable, hard rejections, security breaches.",
    operatorAction: "escalate",
  },
};

export function getFailureStateSeverityMetadata(
  severity: FailureStateSeverity,
): FailureStateSeverityMetadata {
  return FAILURE_STATE_SEVERITY_METADATA[severity];
}

// ============================================================================
// Per-state metadata
// ============================================================================

export interface FailureStateMetadata {
  /** Display label for operator dashboard cards / notification headers
   *  (T-I.33). The state name (e.g. `promotion_failed`) is the
   *  technical identifier; the label is human-readable. */
  readonly label: string;
  readonly category: FailureStateCategory;
  readonly defaultSeverity: FailureStateSeverity;
  /** True when the system retries / falls back automatically; false
   *  when explicit operator action is required to recover. */
  readonly recoverable: boolean;
  /** One-line operator description for the dashboard / notification
   *  text. */
  readonly description: string;
}

export const FAILURE_STATE_METADATA: Readonly<
  Record<FailureState, FailureStateMetadata>
> = {
  promotion_failed: {
    label: "Promotion Failed",
    category: "governance",
    defaultSeverity: "critical",
    recoverable: false,
    description:
      "A note promotion to KB / CAG / Graph Skill rejected — governance gate failed or downstream write errored.",
  },
  note_conflict: {
    label: "Note Conflict",
    category: "runtime",
    defaultSeverity: "warning",
    recoverable: true,
    description:
      "Concurrent edit detected; conflict-resolution UI is the recovery path.",
  },
  entity_resolution_conflict: {
    label: "Entity Resolution Conflict",
    category: "governance",
    defaultSeverity: "warning",
    recoverable: true,
    description:
      "Two entities flagged as merge candidates with conflicting evidence; awaits operator review.",
  },
  neo4j_unavailable: {
    label: "Neo4j Unavailable",
    category: "infrastructure",
    defaultSeverity: "critical",
    recoverable: false,
    description:
      "Neo4j CE health check failed; graph queries return cached + flag stale.",
  },
  neo4j_degraded: {
    label: "Neo4j Degraded",
    category: "infrastructure",
    defaultSeverity: "warning",
    recoverable: true,
    description:
      "Neo4j CE latency above warning threshold; graph queries served but slow.",
  },
  neo4j_query_timeout: {
    label: "Neo4j Query Timeout",
    category: "infrastructure",
    defaultSeverity: "warning",
    recoverable: true,
    description:
      "Specific Cypher query exceeded its budget; partial results returned with truncation flag.",
  },
  neo4j_projection_stale: {
    label: "Neo4j Projection Stale",
    category: "infrastructure",
    defaultSeverity: "info",
    recoverable: true,
    description:
      "Projection sync lag exceeds freshness target; queries return slightly-old data.",
  },
  neo4j_projection_drift_detected: {
    label: "Projection Drift Detected",
    category: "infrastructure",
    defaultSeverity: "warning",
    recoverable: false,
    description:
      "Drift cron detected a Postgres vs Neo4j divergence; awaits operator triage via Phase 23 correction proposal.",
  },
  projection_sync_failed: {
    label: "Projection Sync Failed",
    category: "infrastructure",
    defaultSeverity: "critical",
    recoverable: false,
    description:
      "Projection sync job threw an unrecoverable error; subsequent ticks accumulate backlog.",
  },
  graph_query_timeout: {
    label: "Graph Query Timeout",
    category: "retrieval",
    defaultSeverity: "warning",
    recoverable: true,
    description:
      "GraphRAG retrieval timed out for a specific plan item; partial results delivered.",
  },
  backlink_refresh_failed: {
    label: "Backlink Refresh Failed",
    category: "runtime",
    defaultSeverity: "info",
    recoverable: true,
    description:
      "Backlink index refresh threw on a specific note; the rest of the index is current.",
  },
  runtime_reference_hidden_by_permission: {
    label: "Reference Hidden by Permission",
    category: "governance",
    defaultSeverity: "info",
    recoverable: true,
    description:
      "A CAG block or skill pack referenced a note the viewer cannot access; the reference is redacted in the trace.",
  },
  cag_reference_invalidated: {
    label: "CAG Reference Invalidated",
    category: "governance",
    defaultSeverity: "warning",
    recoverable: false,
    description:
      "A CAG block's source note version was deleted / superseded; the CAG block is marked invalid.",
  },
  graph_skill_reference_invalidated: {
    label: "Skill Pack Reference Invalidated",
    category: "governance",
    defaultSeverity: "warning",
    recoverable: false,
    description:
      "A Skill Pack's source note version was deleted / superseded; the pack is marked invalid.",
  },
  tool_schema_changed: {
    label: "Tool Schema Changed",
    category: "governance",
    defaultSeverity: "warning",
    recoverable: false,
    description:
      "An MCP tool's schema was updated; recorded tool-knowledge promotions need re-validation.",
  },
  search_index_stale: {
    label: "Search Index Stale",
    category: "retrieval",
    defaultSeverity: "info",
    recoverable: true,
    description:
      "Search index lag exceeds freshness target; query results may miss recent notes.",
  },
  query_cache_stale: {
    label: "Query Cache Stale",
    category: "retrieval",
    defaultSeverity: "info",
    recoverable: true,
    description:
      "A specific query cache entry is past its TTL; the next read refreshes.",
  },
  text2cypher_rejected: {
    label: "Text2Cypher Rejected",
    category: "retrieval",
    defaultSeverity: "info",
    recoverable: true,
    description:
      "A Text2Cypher attempt was rejected by the read-only guardrails; the user prompt is logged for evaluation.",
  },
  cypher_query_template_failed: {
    label: "Cypher Template Failed",
    category: "retrieval",
    defaultSeverity: "warning",
    recoverable: false,
    description:
      "A registered Cypher template threw on execution; the template needs operator review.",
  },
  retrieval_safety_filter_blocked_content: {
    label: "Safety Filter Blocked Content",
    category: "retrieval",
    defaultSeverity: "info",
    recoverable: false,
    description:
      "Retrieval safety filter pruned content from the response; redaction recorded with reason.",
  },
  graph_agent_answer_incomplete: {
    label: "Graph Agent Answer Incomplete",
    category: "agent",
    defaultSeverity: "warning",
    recoverable: true,
    description:
      "Graph Agent hit its iteration budget without converging; partial answer delivered with explainability trace.",
  },
  golden_question_failed: {
    label: "Golden Question Failed",
    category: "agent",
    defaultSeverity: "warning",
    recoverable: false,
    description:
      "A regression suite golden question failed; needs explicit waiver or correction proposal.",
  },
  graph_correction_rejected: {
    label: "Graph Correction Rejected",
    category: "governance",
    defaultSeverity: "info",
    recoverable: true,
    description:
      "A correction proposal was rejected by approval; audit row written.",
  },
  semantic_enrichment_rejected: {
    label: "Semantic Enrichment Rejected",
    category: "governance",
    defaultSeverity: "info",
    recoverable: true,
    description:
      "A semantic-enrichment proposal was rejected (confidence below threshold OR operator-rejected); audit row written.",
  },
  background_job_failed: {
    label: "Background Job Failed",
    category: "runtime",
    defaultSeverity: "warning",
    recoverable: true,
    description:
      "A workspace background job threw and was auto-failed by the stale-running sweep.",
  },
};

/**
 * Returns the operator-facing display label for a failure state. The
 * state name (e.g. `promotion_failed`) is the technical identifier;
 * the label is the human-readable name for dashboards / notification
 * headers.
 */
export function getFailureStateLabel(state: FailureState): string {
  return FAILURE_STATE_METADATA[state].label;
}

// ============================================================================
// Coverage helpers
// ============================================================================

/**
 * Returns the failure states in a given category. Operator dashboard
 * tabs use this for per-category counts.
 */
export function listFailureStatesByCategory(
  category: FailureStateCategory,
): ReadonlyArray<FailureState> {
  return FAILURE_STATES.filter(
    (s) => FAILURE_STATE_METADATA[s].category === category,
  );
}

/**
 * Returns the failure states at a given default severity.
 */
export function listFailureStatesBySeverity(
  severity: FailureStateSeverity,
): ReadonlyArray<FailureState> {
  return FAILURE_STATES.filter(
    (s) => FAILURE_STATE_METADATA[s].defaultSeverity === severity,
  );
}

/**
 * Returns the failure states that the system cannot auto-recover —
 * operator action is required. Operator dashboard "Action required"
 * tab uses this.
 */
export function listOperatorActionRequiredFailureStates(): ReadonlyArray<FailureState> {
  return FAILURE_STATES.filter(
    (s) => FAILURE_STATE_METADATA[s].recoverable === false,
  );
}

// ============================================================================
// Severity ordering helpers (T-I.27)
// ============================================================================

/** 0..2 monotone over the closed 3-key taxonomy (info / warning /
 *  critical). Higher rank = more severe. */
export function failureStateSeverityRank(
  severity: FailureStateSeverity,
): number {
  return FAILURE_STATE_SEVERITIES.indexOf(severity);
}

/** Array.sort-style comparator over failure-state severities. */
export function compareFailureStateSeverity(
  a: FailureStateSeverity,
  b: FailureStateSeverity,
): number {
  return failureStateSeverityRank(a) - failureStateSeverityRank(b);
}

/**
 * Returns a new array of items sorted by severity DESCENDING (critical
 * first). Stable for ties (first-occurrence wins). Does NOT mutate.
 */
export function sortBySeverityDesc<T>(
  items: ReadonlyArray<T>,
  getSeverity: (item: T) => FailureStateSeverity,
): readonly T[] {
  return [...items].sort(
    (a, b) =>
      -compareFailureStateSeverity(getSeverity(a), getSeverity(b)),
  );
}

/**
 * Returns the most-severe failure-state item, or undefined for empty
 * input. Ties broken by first occurrence in input order.
 */
export function getMostSevereFailureStateItem<T>(
  items: ReadonlyArray<T>,
  getSeverity: (item: T) => FailureStateSeverity,
): T | undefined {
  if (items.length === 0) return undefined;
  let best = items[0];
  let bestRank = failureStateSeverityRank(getSeverity(best));
  for (let i = 1; i < items.length; i++) {
    const r = failureStateSeverityRank(getSeverity(items[i]));
    if (r > bestRank) {
      best = items[i];
      bestRank = r;
    }
  }
  return best;
}

// ============================================================================
// Category × Severity matrix (T-I.28)
// ============================================================================

export type FailureStateCategorySeverityMatrix = Readonly<
  Record<
    FailureStateCategory,
    Readonly<Record<FailureStateSeverity, number>>
  >
>;

/**
 * Builds a 2D matrix keyed by category × severity from a list of
 * failure-state occurrence kinds. Stable-shape: every category row
 * exists, every severity column exists, zero-valued cells included.
 *
 * Useful for operator dashboards rendering a category-by-severity
 * heat-map. Pure function; no DB / dispatcher / openrouter.
 *
 * Unknown kinds in input are silently ignored (consistent with
 * summarizeFailureStateOccurrences).
 */
export function buildFailureStateCategorySeverityMatrix(
  occurrences: ReadonlyArray<string>,
): FailureStateCategorySeverityMatrix {
  const matrix: Record<string, Record<string, number>> = {};
  for (const cat of FAILURE_STATE_CATEGORIES) {
    matrix[cat] = {};
    for (const sev of FAILURE_STATE_SEVERITIES) {
      matrix[cat][sev] = 0;
    }
  }
  for (const kind of occurrences) {
    if (!isFailureState(kind)) continue;
    const meta = FAILURE_STATE_METADATA[kind];
    matrix[meta.category][meta.defaultSeverity] += 1;
  }
  return matrix as FailureStateCategorySeverityMatrix;
}

// ============================================================================
// Aggregation helper (T-I.23)
// ============================================================================

export interface FailureStateOccurrenceSummary {
  readonly total: number;
  readonly byKind: Readonly<Record<FailureState, number>>;
  readonly byCategory: Readonly<Record<FailureStateCategory, number>>;
  readonly bySeverity: Readonly<Record<FailureStateSeverity, number>>;
  readonly byRecoverable: Readonly<{
    readonly recoverable: number;
    readonly operatorActionRequired: number;
  }>;
}

/**
 * Aggregates a list of observed failure-state occurrences (each
 * occurrence identified by its closed-taxonomy kind) into a stable-
 * shape summary with every closed-taxonomy axis keyed at zero or
 * higher.
 *
 * Stable-shape semantics: every `FailureState`, every
 * `FailureStateCategory`, every `FailureStateSeverity` appears as a
 * key in the returned record even when the count is 0. This lets
 * operator dashboards bind to a fixed set of columns without
 * defensive `??` reads, and it surfaces "category X is silent right
 * now" as a 0 rather than a missing row.
 *
 * Unknown kinds in the input are silently ignored (no throw) — the
 * bridge encodes via the closed-taxonomy guard at write-time, so
 * unknown values here imply a stale-string read from a non-bridge
 * emitter and shouldn't blow up the summary.
 *
 * Pure function. Does NOT mutate the input.
 */
export function summarizeFailureStateOccurrences(
  occurrences: ReadonlyArray<string>,
): FailureStateOccurrenceSummary {
  const byKind: Record<string, number> = {};
  for (const kind of FAILURE_STATES) byKind[kind] = 0;

  const byCategory: Record<string, number> = {};
  for (const cat of FAILURE_STATE_CATEGORIES) byCategory[cat] = 0;

  const bySeverity: Record<string, number> = {};
  for (const sev of FAILURE_STATE_SEVERITIES) bySeverity[sev] = 0;

  let recoverable = 0;
  let operatorActionRequired = 0;
  let total = 0;

  for (const kind of occurrences) {
    if (!isFailureState(kind)) continue;
    const meta = FAILURE_STATE_METADATA[kind];
    byKind[kind] += 1;
    byCategory[meta.category] += 1;
    bySeverity[meta.defaultSeverity] += 1;
    if (meta.recoverable) recoverable += 1;
    else operatorActionRequired += 1;
    total += 1;
  }

  return {
    total,
    byKind: byKind as Readonly<Record<FailureState, number>>,
    byCategory: byCategory as Readonly<Record<FailureStateCategory, number>>,
    bySeverity: bySeverity as Readonly<Record<FailureStateSeverity, number>>,
    byRecoverable: { recoverable, operatorActionRequired },
  };
}
