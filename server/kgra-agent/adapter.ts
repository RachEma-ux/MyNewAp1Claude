/**
 * KGRA Agent Adapter — native TypeScript engine.
 * No Python proxy. Calls the KGRA engine directly.
 */

import { executeKGRARun } from "./engine";

export interface KGRARunRequest {
  query: string;
  mode?: string;
  workspace_id?: string;
  session_id?: string;
}

export interface KGRABundleRequest {
  documents: Array<{ name: string; content: string }>;
  bundle_name?: string;
}

export interface KGRAAnswer {
  answer: string;
  mode: string;
  confidence: number;
  observed_facts: Array<{ id: string; label: string; sourceRef: string }>;
  inferred_claims: Array<{ id: string; text: string; basis: string[]; confidence: number }>;
  evidence_graph: { nodes: any[]; edges: any[] };
  provenance: Array<{ source_type: string; source_ref: string; operation_ref: string }>;
  temporal: { as_of: string; valid_from?: string; valid_to?: string; warning?: string };
  missing_knowledge: { hasGap: boolean; summary?: string };
  governance: { verdict: string; reasons: string[]; human_review_required?: boolean };
  learning: { knowledge_graph_updated: boolean; reasoning_path_id?: string; evaluated_bundle?: any };
  analytical: { reasoning_strength: number; vulnerability?: number; alternative_hypotheses?: any[]; causal_claims?: any[] };
  error?: { code: string; message: string; failedSteps: string[]; fallbackUsed: string };
  cost_estimate: { llm_tokens: number; graph_reads: number; vector_queries: number; mcp_calls: number; estimated_usd_cents: number };
  run_id: string;
  request_id: string;
}

export interface KGRAHealthResult {
  healthy: boolean;
  status: string;
  version: string;
  error?: string;
  latencyMs: number;
}

/**
 * Health check — always healthy (native engine).
 */
export async function kgraHealth(): Promise<KGRAHealthResult> {
  return {
    healthy: true,
    status: "healthy",
    version: "2.0.0-native",
    latencyMs: 0,
  };
}

/**
 * Run a KGRA query through the native 12-node pipeline.
 */
export async function kgraRun(request: KGRARunRequest): Promise<KGRAAnswer> {
  return executeKGRARun({
    query: request.query,
    mode: request.mode,
    workspace_id: request.workspace_id,
    session_id: request.session_id,
  });
}

/**
 * Evaluate a knowledge bundle using the bundle evaluation subgraph.
 */
export async function kgraEvaluateBundle(request: KGRABundleRequest): Promise<KGRAAnswer> {
  return executeKGRARun({
    query: `Evaluate knowledge bundle: ${request.bundle_name || "unnamed"}`,
    mode: "bundle_evaluation",
  });
}

/**
 * Get a reasoning path by ID (stub — returns empty).
 */
export async function kgraGetReasoningPath(pathId: string): Promise<any> {
  return { path_id: pathId, nodes: [], edges: [], status: "not_found" };
}
