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
// Severity taxonomy
// ============================================================================

export const FAILURE_STATE_SEVERITIES = [
  "info",
  "warning",
  "critical",
] as const;

export type FailureStateSeverity = (typeof FAILURE_STATE_SEVERITIES)[number];

// ============================================================================
// Per-state metadata
// ============================================================================

export interface FailureStateMetadata {
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
    category: "governance",
    defaultSeverity: "critical",
    recoverable: false,
    description:
      "A note promotion to KB / CAG / Graph Skill rejected — governance gate failed or downstream write errored.",
  },
  note_conflict: {
    category: "runtime",
    defaultSeverity: "warning",
    recoverable: true,
    description:
      "Concurrent edit detected; conflict-resolution UI is the recovery path.",
  },
  entity_resolution_conflict: {
    category: "governance",
    defaultSeverity: "warning",
    recoverable: true,
    description:
      "Two entities flagged as merge candidates with conflicting evidence; awaits operator review.",
  },
  neo4j_unavailable: {
    category: "infrastructure",
    defaultSeverity: "critical",
    recoverable: false,
    description:
      "Neo4j CE health check failed; graph queries return cached + flag stale.",
  },
  neo4j_degraded: {
    category: "infrastructure",
    defaultSeverity: "warning",
    recoverable: true,
    description:
      "Neo4j CE latency above warning threshold; graph queries served but slow.",
  },
  neo4j_query_timeout: {
    category: "infrastructure",
    defaultSeverity: "warning",
    recoverable: true,
    description:
      "Specific Cypher query exceeded its budget; partial results returned with truncation flag.",
  },
  neo4j_projection_stale: {
    category: "infrastructure",
    defaultSeverity: "info",
    recoverable: true,
    description:
      "Projection sync lag exceeds freshness target; queries return slightly-old data.",
  },
  neo4j_projection_drift_detected: {
    category: "infrastructure",
    defaultSeverity: "warning",
    recoverable: false,
    description:
      "Drift cron detected a Postgres vs Neo4j divergence; awaits operator triage via Phase 23 correction proposal.",
  },
  projection_sync_failed: {
    category: "infrastructure",
    defaultSeverity: "critical",
    recoverable: false,
    description:
      "Projection sync job threw an unrecoverable error; subsequent ticks accumulate backlog.",
  },
  graph_query_timeout: {
    category: "retrieval",
    defaultSeverity: "warning",
    recoverable: true,
    description:
      "GraphRAG retrieval timed out for a specific plan item; partial results delivered.",
  },
  backlink_refresh_failed: {
    category: "runtime",
    defaultSeverity: "info",
    recoverable: true,
    description:
      "Backlink index refresh threw on a specific note; the rest of the index is current.",
  },
  runtime_reference_hidden_by_permission: {
    category: "governance",
    defaultSeverity: "info",
    recoverable: true,
    description:
      "A CAG block or skill pack referenced a note the viewer cannot access; the reference is redacted in the trace.",
  },
  cag_reference_invalidated: {
    category: "governance",
    defaultSeverity: "warning",
    recoverable: false,
    description:
      "A CAG block's source note version was deleted / superseded; the CAG block is marked invalid.",
  },
  graph_skill_reference_invalidated: {
    category: "governance",
    defaultSeverity: "warning",
    recoverable: false,
    description:
      "A Skill Pack's source note version was deleted / superseded; the pack is marked invalid.",
  },
  tool_schema_changed: {
    category: "governance",
    defaultSeverity: "warning",
    recoverable: false,
    description:
      "An MCP tool's schema was updated; recorded tool-knowledge promotions need re-validation.",
  },
  search_index_stale: {
    category: "retrieval",
    defaultSeverity: "info",
    recoverable: true,
    description:
      "Search index lag exceeds freshness target; query results may miss recent notes.",
  },
  query_cache_stale: {
    category: "retrieval",
    defaultSeverity: "info",
    recoverable: true,
    description:
      "A specific query cache entry is past its TTL; the next read refreshes.",
  },
  text2cypher_rejected: {
    category: "retrieval",
    defaultSeverity: "info",
    recoverable: true,
    description:
      "A Text2Cypher attempt was rejected by the read-only guardrails; the user prompt is logged for evaluation.",
  },
  cypher_query_template_failed: {
    category: "retrieval",
    defaultSeverity: "warning",
    recoverable: false,
    description:
      "A registered Cypher template threw on execution; the template needs operator review.",
  },
  retrieval_safety_filter_blocked_content: {
    category: "retrieval",
    defaultSeverity: "info",
    recoverable: false,
    description:
      "Retrieval safety filter pruned content from the response; redaction recorded with reason.",
  },
  graph_agent_answer_incomplete: {
    category: "agent",
    defaultSeverity: "warning",
    recoverable: true,
    description:
      "Graph Agent hit its iteration budget without converging; partial answer delivered with explainability trace.",
  },
  golden_question_failed: {
    category: "agent",
    defaultSeverity: "warning",
    recoverable: false,
    description:
      "A regression suite golden question failed; needs explicit waiver or correction proposal.",
  },
  graph_correction_rejected: {
    category: "governance",
    defaultSeverity: "info",
    recoverable: true,
    description:
      "A correction proposal was rejected by approval; audit row written.",
  },
  semantic_enrichment_rejected: {
    category: "governance",
    defaultSeverity: "info",
    recoverable: true,
    description:
      "A semantic-enrichment proposal was rejected (confidence below threshold OR operator-rejected); audit row written.",
  },
  background_job_failed: {
    category: "runtime",
    defaultSeverity: "warning",
    recoverable: true,
    description:
      "A workspace background job threw and was auto-failed by the stale-running sweep.",
  },
};

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
