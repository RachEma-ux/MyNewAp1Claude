/**
 * RAC Retrieval Executor — Phase 4.
 *
 * Fans `adapter.search()` across every runnable plan item in parallel,
 * applies a per-call timeout (D-RET-6 default 3000 ms; per-profile
 * override via `profile.timeoutMs`), records start/end timestamps for
 * P7 trace, and forwards adapter warnings into a structured result.
 *
 * Boundaries:
 *   - In-process source types (planner flagged `in_process_pending`)
 *     get an `in_process_synthesizer_pending` warning + empty result.
 *     Concrete synthesizers are deferred to a P4 follow-up or P5/P6.
 *   - Adapter exceptions are caught and turned into `adapter_error`
 *     warnings; one bad source never breaks the whole retrieval.
 *   - The executor never embeds the query itself (today's gap-shaped
 *     adapters don't need it). Once a real adapter lands that needs
 *     a query embedding, it does its own `withEmbeddingCredential`
 *     dance — the executor still calls only `adapter.search()`.
 */

import type {
  RacRetrievalChunk,
  RacRetrievalRequest,
  RacRetrievalResult,
} from "./ingestion";
import type { RetrievalPlan, RetrievalPlanItem } from "./retrieval-planner";

/** D-RET-6 default. Per-profile override flows through `RetrievalPlan.profile.timeoutMs`. */
export const DEFAULT_RETRIEVAL_TIMEOUT_MS = 3000;

export interface ExecutedSourceResult {
  sourceId: number;
  sourceType: string;
  /** Adapter chunks (pre-filter — the filter is applied in `retrieval-filter.ts`). */
  chunks: RacRetrievalChunk[];
  latencyMs: number;
  warnings: string[];
  /** Set when a runnable item failed at execution time (adapter throw, timeout, …). */
  errorReason?: "timeout" | "adapter_error" | "skipped";
  skipReason?: NonNullable<RetrievalPlanItem["skipReason"]>;
}

export interface ExecuteRetrievalInput {
  plan: RetrievalPlan;
  query: string;
  topK?: number;
  /** Fed into `RacRetrievalRequest.filters` (adapter-defined). */
  filters?: Record<string, unknown>;
}

export interface ExecutedRetrieval {
  perSource: ExecutedSourceResult[];
  /** Aggregated chunks across runnable sources (no filtering applied yet). */
  chunks: RacRetrievalChunk[];
  /** Wall-clock latency for the whole executor run. */
  totalLatencyMs: number;
  warnings: string[];
}

export async function executeRetrieval(
  input: ExecuteRetrievalInput,
): Promise<ExecutedRetrieval> {
  const start = Date.now();
  const timeoutMs =
    input.plan.profile.timeoutMs ?? DEFAULT_RETRIEVAL_TIMEOUT_MS;
  const topK = input.topK ?? 8; // executor default; filter applies maxChunks separately

  const perSource = await Promise.all(
    input.plan.items.map((item) => runItem(item, input, timeoutMs, topK)),
  );

  const chunks: RacRetrievalChunk[] = [];
  const warnings: string[] = [...input.plan.warnings];
  for (const r of perSource) {
    chunks.push(...r.chunks);
    for (const w of r.warnings) warnings.push(`source=${r.sourceId}: ${w}`);
  }

  return {
    perSource,
    chunks,
    totalLatencyMs: Date.now() - start,
    warnings,
  };
}

async function runItem(
  item: RetrievalPlanItem,
  input: ExecuteRetrievalInput,
  timeoutMs: number,
  topK: number,
): Promise<ExecutedSourceResult> {
  const start = Date.now();
  const baseResult: Omit<ExecutedSourceResult, "chunks" | "warnings"> = {
    sourceId: item.source.id,
    sourceType: item.source.sourceType,
    latencyMs: 0,
  };

  // Plan-level skips short-circuit; executor still emits a row so the
  // trace ledger lists every registered source.
  if (item.skipReason) {
    return {
      ...baseResult,
      chunks: [],
      latencyMs: 0,
      warnings: skipReasonWarnings(item.skipReason, item.source.sourceType),
      errorReason: "skipped",
      skipReason: item.skipReason,
    };
  }
  if (!item.adapter) {
    // Defensive — planner guarantees adapter is non-null when skipReason is null.
    return {
      ...baseResult,
      chunks: [],
      latencyMs: 0,
      warnings: ["adapter_missing_at_execution_time (planner contract violation)"],
      errorReason: "skipped",
      skipReason: "no_adapter",
    };
  }

  const request: RacRetrievalRequest = {
    workspaceId: item.source.workspaceId,
    sourceId: item.source.id,
    query: input.query,
    topK,
    filters: input.filters,
    timeoutMs,
    workspaceEmbeddingDefault:
      item.embedding && item.embedding.resolvedFrom === "workspace_default"
        ? {
            embeddingProviderConnectionId: item.embedding.providerConnectionId,
            embeddingModelRef: item.embedding.modelRef,
            embeddingModelDim: item.embedding.dim,
          }
        : null,
  };

  try {
    const result = await runWithTimeout(
      item.adapter.search(request),
      timeoutMs,
    );
    return {
      ...baseResult,
      chunks: result.chunks,
      latencyMs: Date.now() - start,
      warnings: result.warnings,
    };
  } catch (err) {
    const isTimeout =
      err instanceof Error && err.message === "rac_retrieval_timeout";
    const reason = isTimeout ? "timeout" : "adapter_error";
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ...baseResult,
      chunks: [],
      latencyMs: Date.now() - start,
      warnings: [`${reason}: ${detail}`],
      errorReason: reason,
    };
  }
}

function skipReasonWarnings(
  reason: NonNullable<RetrievalPlanItem["skipReason"]>,
  sourceType: string,
): string[] {
  switch (reason) {
    case "disabled":
      return [`disabled: source row enabled=false`];
    case "in_process_pending":
      return [
        `in_process_synthesizer_pending: source_type=${sourceType} requires an in-process synthesizer (deferred from P3 — slated for P4 follow-up or P5/P6)`,
      ];
    case "no_adapter":
      return [`no_adapter: source_type=${sourceType} has no registered adapter`];
    case "embedding_unavailable":
      return [`embedding_unavailable: D-EMB-5 fail-closed at plan time`];
    default:
      return [`skipped: ${reason}`];
  }
}

/**
 * Race a promise against a timeout. The promise itself isn't cancelled
 * — adapters are responsible for their own cancellation when the
 * caller passes `timeoutMs` in the request — but the executor stops
 * waiting and reports `timeout`.
 */
function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const handle = setTimeout(
      () => reject(new Error("rac_retrieval_timeout")),
      timeoutMs,
    );
    promise.then(
      (v) => {
        clearTimeout(handle);
        resolve(v);
      },
      (err) => {
        clearTimeout(handle);
        reject(err);
      },
    );
  });
}

// Re-export for callers that want to assemble custom executors over
// the same primitives without depending on the public barrel.
export type { RacRetrievalChunk, RacRetrievalRequest, RacRetrievalResult };
