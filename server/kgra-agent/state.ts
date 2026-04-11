/**
 * KGRA State — TypeScript port of the Python KGRAState.
 * Complete state for the KGRA state machine pipeline.
 */

// ── Intent Types ────────────────────────────────────────────────

export type IntentType =
  | "factual"
  | "comparative"
  | "exploratory"
  | "temporal"
  | "hypothetical"
  | "learning_request"
  | "research_directive"
  | "ontology_design"
  | "contradiction_resolution"
  | "cross_agent_collaboration"
  | "reasoning_path_reuse"
  | "self_evaluation"
  | "bundle_evaluation";

// ── Runtime Modes ───────────────────────────────────────────────

export type RuntimeMode =
  | "direct_query"
  | "path_reasoning"
  | "graphrag_local"
  | "graphrag_global"
  | "drift"
  | "basic_rag"
  | "human_review"
  | "self_learning"
  | "expertise_building"
  | "research_mode"
  | "cross_agent_collaboration"
  | "reasoning_path_reuse"
  | "bundle_evaluation";

// ── Evidence ────────────────────────────────────────────────────

export interface EvidenceNode {
  id: string;
  node_type: string; // "fact" | "claim" | "evidence" | "decision"
  label: string;
  source_ref: string;
  confidence: number;
  timestamp?: string;
  properties?: Record<string, unknown>;
}

export interface EvidenceEdge {
  id: string;
  from_id: string;
  to_id: string;
  edge_type: string; // "supports" | "contradicts" | "resolves" | "depends_on" | "precedes"
  weight: number;
}

// ── Provenance ──────────────────────────────────────────────────

export interface ProvenanceEntry {
  source_type: string; // "graph" | "document" | "memory" | "llm" | "research" | "evaluated_bundle"
  source_ref: string;
  operation_ref: string;
  derivation_path?: string[];
}

// ── Cost ────────────────────────────────────────────────────────

export interface CostTracker {
  llm_tokens: number;
  graph_reads: number;
  vector_queries: number;
  mcp_calls: number;
  estimated_usd_cents: number;
}

// ── Temporal ────────────────────────────────────────────────────

export interface TemporalScope {
  as_of: string;
  valid_from?: string;
  valid_to?: string;
  warning?: string;
}

// ── Governance ──────────────────────────────────────────────────

export interface GovernanceVerdict {
  verdict: string; // "allow" | "conditions" | "deny"
  reasons: string[];
  human_review_required: boolean;
}

// ── Bundle Evaluation ───────────────────────────────────────────

export interface BundleEvaluationState {
  bundle_id: string;
  documents: Array<{ name: string; content: string }>;
  review_log: string;
  coherence_score: number;
  coherence_verdict: string;
  readiness_score: number;
  readiness_missing: string[];
  resolved_decisions: Array<Record<string, unknown>>;
  contract_mappings: Array<Record<string, unknown>>;
  current_pass: number;
}

// ── Learning ────────────────────────────────────────────────────

export interface LearningOutcome {
  knowledge_graph_updated: boolean;
  new_node_types?: string[];
  new_relation_types?: string[];
  reasoning_path_id?: string;
  evaluated_bundle?: Record<string, unknown>;
}

// ── Analytical ──────────────────────────────────────────────────

export interface AnalyticalMeta {
  reasoning_strength: number;
  vulnerability?: number;
  alternative_hypotheses?: Array<Record<string, unknown>>;
  causal_claims?: Array<Record<string, unknown>>;
}

// ── Tool Call Log ───────────────────────────────────────────────

export interface ToolCallEntry {
  tool: string;
  inputs: Record<string, unknown>;
  output_summary: string;
  timestamp: string;
  cost: Partial<CostTracker>;
}

// ── Complete KGRA State ─────────────────────────────────────────

export interface KGRAState {
  // Request
  run_id: string;
  request_id: string;
  query: string;
  workspace_id?: string;
  session_id?: string;
  user_id?: string;

  // Intent & Mode
  intent: IntentType;
  resolved_terms: Record<string, string>;
  mode: RuntimeMode;

  // Schema & Query Planning
  schema_slice: Record<string, unknown>;
  planned_query: string;
  query_language: string;
  query_validated: boolean;
  validation_errors: string[];

  // Execution Results
  raw_results: Array<Record<string, unknown>>;
  paths: Array<Record<string, unknown>>;
  ranked_paths: Array<Record<string, unknown>>;

  // Evidence
  observed_facts: Array<{ id: string; label: string; sourceRef: string }>;
  inferred_claims: Array<{ id: string; text: string; basis: string[]; confidence: number }>;
  evidence_nodes: EvidenceNode[];
  evidence_edges: EvidenceEdge[];
  provenance: ProvenanceEntry[];

  // Temporal
  temporal: TemporalScope;

  // Contradictions
  contradictions: Array<Record<string, unknown>>;
  hypotheses: Array<Record<string, unknown>>;

  // Answer
  answer: string;
  confidence: number;
  missing_knowledge: { hasGap: boolean; summary?: string };

  // Governance
  governance: GovernanceVerdict;

  // Learning
  learning: LearningOutcome;

  // Analytical
  analytical: AnalyticalMeta;

  // Bundle Evaluation
  evaluation?: BundleEvaluationState;

  // Cost
  cost: CostTracker;

  // Control Flow
  current_node: string;
  completed_nodes: string[];
  errors: string[];
  tool_calls: ToolCallEntry[];
  started_at: string;
  fallback_used: string;
}

// ── Factory ─────────────────────────────────────────────────────

export function createInitialState(query: string, runId: string, requestId: string): KGRAState {
  const now = new Date().toISOString();
  return {
    run_id: runId,
    request_id: requestId,
    query,
    intent: "factual",
    resolved_terms: {},
    mode: "direct_query",
    schema_slice: {},
    planned_query: "",
    query_language: "",
    query_validated: false,
    validation_errors: [],
    raw_results: [],
    paths: [],
    ranked_paths: [],
    observed_facts: [],
    inferred_claims: [],
    evidence_nodes: [],
    evidence_edges: [],
    provenance: [],
    temporal: { as_of: now },
    contradictions: [],
    hypotheses: [],
    answer: "",
    confidence: 0,
    missing_knowledge: { hasGap: false },
    governance: { verdict: "allow", reasons: [], human_review_required: false },
    learning: { knowledge_graph_updated: false },
    analytical: { reasoning_strength: 0 },
    cost: { llm_tokens: 0, graph_reads: 0, vector_queries: 0, mcp_calls: 0, estimated_usd_cents: 0 },
    current_node: "",
    completed_nodes: [],
    errors: [],
    tool_calls: [],
    started_at: now,
    fallback_used: "",
  };
}
