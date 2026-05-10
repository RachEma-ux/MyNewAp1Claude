/**
 * RAC Retrieval Planner — Phase 4.
 *
 * Turns a (workspaceId, profileId) pair into an ordered list of plan
 * items the executor fans out across in parallel. Each item carries
 * the source row, the resolved adapter, and the embedding binding
 * already pinned for the source. The planner does the source-registry
 * I/O so the executor can stay pure-fanout.
 *
 * Ordering (D-RET-1 §priority): sources are sorted by `priority DESC`,
 * tie-broken by `id ASC`. The store's `listSourcesForProfile` already
 * returns them in this order; the planner keeps the contract explicit
 * so future callers don't depend on store-internal ordering.
 *
 * The planner never silently drops a source. Disabled rows are kept
 * in the output flagged `enabled: false`; the executor skips them but
 * the trace still records that they exist (so operators can tell
 * "source registered but disabled" from "source missing entirely").
 */

import {
  listSourcesForProfile,
  getProfile,
  getWorkspaceEmbeddingDefault,
  type RacProfile,
  type RacSource,
  type RacWorkspaceEmbeddingDefault,
} from "./sources";
import {
  pickAdapter,
  resolveEmbeddingBinding,
  EmbeddingProviderUnavailableError,
  type RacIngestionAdapter,
  type ResolvedEmbeddingBinding,
} from "./ingestion";
// H3-c8 (cycle-8 audit closure §H3-c8): bound the planner's I/O so a
// hung DB query (lock contention, ASDB outage mid-query) doesn't
// stall the entire chat turn. Same shape as H2-c8's CAG-resolver
// timeout one layer up; reuses the shared `withTimeout` helper.
import {
  withTimeout,
  isTimeoutError,
} from "../runtime/with-timeout";

/**
 * H3-c8: per-call timeout ceiling for the planner's source-registry
 * I/O. Default 5s — DB queries should complete in milliseconds; a
 * 5s ceiling catches lock-contention or ASDB outages without
 * stalling the chat turn. Operator override via
 * `RAC_PLANNER_TIMEOUT_MS`. Out-of-range warns + falls back per the
 * standing pattern (cycle-7 L5-c6 / H1-c7 / H7-c7 / H8-c7 / H2-c8).
 *
 * On timeout the planner throws a `PlannerTimeoutError` so the
 * orchestrator's safe_degraded mode catches it and degrades
 * gracefully (retrieval is best-effort by design; the chat shouldn't
 * fail just because retrieval is slow).
 */
const RAC_PLANNER_TIMEOUT_MS = (() => {
  const raw = process.env.RAC_PLANNER_TIMEOUT_MS;
  if (!raw) return 5_000;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) {
    console.warn(
      `[rac-planner] RAC_PLANNER_TIMEOUT_MS=${raw} is not a positive integer; using default 5000ms`,
    );
    return 5_000;
  }
  return n;
})();

/**
 * H3-c8: typed error surfaced when the planner's I/O exceeds the
 * timeout ceiling. Distinct from the orchestrator's
 * `RetrievalRequiredError` (which is the strict-mode escalation);
 * `PlannerTimeoutError` is the safe-degraded signal the orchestrator
 * catches + records as `retrieval_error` fallback.
 */
export class PlannerTimeoutError extends Error {
  readonly code = "rac_planner_timeout";
  constructor(detail: string) {
    super(`RAC planner I/O timed out: ${detail}`);
    this.name = "PlannerTimeoutError";
  }
}

export interface RetrievalPlanItem {
  source: RacSource;
  /** Null when the source type is in-process (memory, workspace_context, …) or pending P4 wiring. */
  adapter: RacIngestionAdapter | null;
  /** Resolved at plan time so the executor doesn't re-fetch the workspace default. Null when D-EMB-5 fail-closed fired (skip is the safe default). */
  embedding: ResolvedEmbeddingBinding | null;
  /** Reason the planner attached for trace surfacing — e.g. `disabled`, `no_adapter`, `embedding_unavailable`. Null when the item is fully runnable. */
  skipReason:
    | null
    | "disabled"
    | "no_adapter"
    | "in_process_pending"
    | "embedding_unavailable";
}

export interface RetrievalPlan {
  workspaceId: number;
  profile: RacProfile;
  workspaceEmbeddingDefault: RacWorkspaceEmbeddingDefault | null;
  items: RetrievalPlanItem[];
  /** Source rows that were enabled and fully runnable. Subset of `items`. */
  runnableCount: number;
  /** Counts per skip reason for observability. */
  skipCounts: Record<NonNullable<RetrievalPlanItem["skipReason"]>, number>;
  warnings: string[];
}

export interface PlanRetrievalInput {
  workspaceId: number;
  profileId: number;
}

/**
 * Source types that intentionally have no RAC adapter because the CAG
 * resolver renders them directly. Today this is just `cag_pack`; the
 * five legacy synthesizer types (`memory`, `workspace_context`,
 * `project_context`, `tool_result_context`, `manual_context`) were
 * removed from the source-type enum at D3 closure since nothing
 * produced them and the synthesizer shape never fit the ingestion
 * pipeline.
 */
const IN_PROCESS_TYPES: ReadonlySet<string> = new Set(["cag_pack"]);

/**
 * Build the plan. Pure I/O; no upstream HTTP; no embedding calls.
 *
 * Throws when the profile doesn't exist (caller's job to surface).
 * Otherwise never throws — sources that fail their per-row checks
 * are kept in the plan with `skipReason` set.
 */
export async function planRetrieval(
  input: PlanRetrievalInput,
): Promise<RetrievalPlan> {
  // H3-c8: bound EACH I/O call independently. Wrapping the
  // Promise.all as a whole would mean a single hung query takes the
  // full timeout budget AND no breadcrumb names which one stalled.
  // Per-call wrapping surfaces the offender via the timeout label.
  let profile: RacProfile | null;
  try {
    profile = await withTimeout(
      getProfile(input.profileId),
      RAC_PLANNER_TIMEOUT_MS,
      `getProfile(${input.profileId})`,
    );
  } catch (err) {
    if (isTimeoutError(err)) {
      throw new PlannerTimeoutError(
        err instanceof Error ? err.message : String(err),
      );
    }
    throw err;
  }
  if (!profile) throw new Error(`RAC profile ${input.profileId} not found`);
  if (profile.workspaceId !== input.workspaceId) {
    throw new Error(
      `RAC profile ${input.profileId} workspace mismatch: profile=${profile.workspaceId}, input=${input.workspaceId}`,
    );
  }

  let sources: RacSource[];
  let workspaceDefault: RacWorkspaceEmbeddingDefault | null;
  try {
    [sources, workspaceDefault] = await Promise.all([
      withTimeout(
        listSourcesForProfile(input.profileId),
        RAC_PLANNER_TIMEOUT_MS,
        `listSourcesForProfile(${input.profileId})`,
      ),
      withTimeout(
        getWorkspaceEmbeddingDefault(input.workspaceId),
        RAC_PLANNER_TIMEOUT_MS,
        `getWorkspaceEmbeddingDefault(${input.workspaceId})`,
      ),
    ]);
  } catch (err) {
    if (isTimeoutError(err)) {
      throw new PlannerTimeoutError(
        err instanceof Error ? err.message : String(err),
      );
    }
    throw err;
  }

  const items: RetrievalPlanItem[] = sources.map((source) =>
    buildItem(source, workspaceDefault),
  );

  const skipCounts: RetrievalPlan["skipCounts"] = {
    disabled: 0,
    no_adapter: 0,
    in_process_pending: 0,
    embedding_unavailable: 0,
  };
  const warnings: string[] = [];
  let runnable = 0;
  for (const item of items) {
    if (item.skipReason) {
      skipCounts[item.skipReason] += 1;
      warnings.push(
        `plan: skip source=${item.source.id} type=${item.source.sourceType} reason=${item.skipReason}`,
      );
    } else {
      runnable += 1;
    }
  }

  return {
    workspaceId: input.workspaceId,
    profile,
    workspaceEmbeddingDefault: workspaceDefault,
    items,
    runnableCount: runnable,
    skipCounts,
    warnings,
  };
}

/**
 * Pure function — useful for unit tests without a live DB. Given a
 * source row + the workspace default, returns the plan item. The
 * planner uses this internally; tests use it directly.
 */
export function buildItem(
  source: RacSource,
  workspaceDefault: RacWorkspaceEmbeddingDefault | null,
): RetrievalPlanItem {
  if (!source.enabled) {
    return { source, adapter: null, embedding: null, skipReason: "disabled" };
  }

  const adapter = pickAdapter(source.sourceType);
  // In-process types are intentionally adapter-less today; flag them
  // separately from "no adapter at all" so the trace can distinguish.
  if (!adapter) {
    return {
      source,
      adapter: null,
      embedding: null,
      skipReason: IN_PROCESS_TYPES.has(source.sourceType)
        ? "in_process_pending"
        : "no_adapter",
    };
  }

  let embedding: ResolvedEmbeddingBinding | null;
  try {
    embedding = resolveEmbeddingBinding(source, workspaceDefault);
  } catch (err) {
    if (err instanceof EmbeddingProviderUnavailableError) {
      return {
        source,
        adapter,
        embedding: null,
        skipReason: "embedding_unavailable",
      };
    }
    throw err;
  }

  return { source, adapter, embedding, skipReason: null };
}
