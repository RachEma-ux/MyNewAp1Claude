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
  const profile = await getProfile(input.profileId);
  if (!profile) throw new Error(`RAC profile ${input.profileId} not found`);
  if (profile.workspaceId !== input.workspaceId) {
    throw new Error(
      `RAC profile ${input.profileId} workspace mismatch: profile=${profile.workspaceId}, input=${input.workspaceId}`,
    );
  }

  const [sources, workspaceDefault] = await Promise.all([
    listSourcesForProfile(input.profileId),
    getWorkspaceEmbeddingDefault(input.workspaceId),
  ]);

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
