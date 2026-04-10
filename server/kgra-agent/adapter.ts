/**
 * KGRA Agent Adapter — server-side proxy to the KGRA Python service.
 * All calls are server-side only. No browser-direct calls to KGRA.
 * Same pattern as the OmniRAG adapter.
 */

const KGRA_URL = process.env.KGRA_URL || "http://localhost:8000";
const KGRA_TIMEOUT = 45_000; // 45s — matches p99 latency target

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
 * Check if the KGRA Python service is running.
 */
export async function kgraHealth(): Promise<KGRAHealthResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${KGRA_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      return { healthy: false, status: "error", version: "", error: `HTTP ${res.status}`, latencyMs };
    }

    const data = await res.json();
    return { healthy: true, status: data.status, version: data.version || "2.0", latencyMs };
  } catch (err) {
    return {
      healthy: false,
      status: "offline",
      version: "",
      error: (err as Error).message,
      latencyMs: Date.now() - start,
    };
  }
}

/**
 * Run a KGRA query (synchronous).
 */
export async function kgraRun(request: KGRARunRequest): Promise<KGRAAnswer> {
  const res = await fetch(`${KGRA_URL}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(KGRA_TIMEOUT),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`KGRA ${res.status}: ${body.slice(0, 300)}`);
  }

  return res.json();
}

/**
 * Evaluate a knowledge bundle.
 */
export async function kgraEvaluateBundle(request: KGRABundleRequest): Promise<KGRAAnswer> {
  const res = await fetch(`${KGRA_URL}/evaluate_bundle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(KGRA_TIMEOUT),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`KGRA evaluate ${res.status}: ${body.slice(0, 300)}`);
  }

  return res.json();
}

/**
 * Get a reasoning path by ID.
 */
export async function kgraGetReasoningPath(pathId: string): Promise<any> {
  const res = await fetch(`${KGRA_URL}/reasoning_path/${pathId}`, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`KGRA path ${res.status}`);
  return res.json();
}
