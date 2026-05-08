/**
 * RAC Runtime Orchestrator — Phase 6.
 *
 * Single entry point that owns the locked runtime sequence:
 *
 *   resolveCagPack (P1C) →
 *   pick RAC profile (P2) →
 *   planRetrieval (P4) →
 *   executeRetrieval (P4) →
 *   filterRetrieval (P4) →
 *   assembleRetrievalEvidence (P5)
 *
 * Returns the two `SystemPromptSection`s the composer (P1C) needs:
 * `capabilityPack` and `retrievalEvidence`. The caller still owns the
 * compose call so it can mix in draft fields it already loaded.
 *
 * Modes (D-PRM-6, applied to BOTH CAG and retrieval):
 *   - `disabled`       — both sections skipped; composer falls back to
 *                        legacy concat. Useful for golden-test parity.
 *   - `safe_degraded`  — missing CAG / retrieval timeout produce
 *                        warnings; the runtime continues. (Chat default.)
 *   - `strict`         — missing CAG throws `CagRequiredError`;
 *                        retrieval timeout / unrecoverable failure
 *                        throws `RetrievalRequiredError`.
 *
 * Boundary:
 *   This file is the ONE non-composer file in `server/agent-studio/`
 *   that imports both `services/cag/resolver` (via the barrel) and
 *   `services/rac/context-assembler`. Phase 1E "Rule C" activates in
 *   the CAG boundary lint to enforce that — the only allow-list
 *   entries are this file and the composer.
 */

import { resolveCagPack } from "../cag";
import {
  composeSystemPrompt,
  CagRequiredError,
  type ComposerMode,
  type SystemPromptInput,
} from "./system-prompt-composer";
import {
  planRetrieval,
  executeRetrieval,
  filterRetrieval,
  type RetrievalPlan,
  type ExecutedRetrieval,
  type ExecutedSourceResult,
} from "../rac/retrieval";
import { assembleRetrievalEvidence } from "../rac/context-assembler";
import type { RacRetrievalChunk } from "../rac/ingestion";
import { listProfilesForDraft, getPolicyForProfile } from "../rac/sources";
import type { SystemPromptSection } from "../cag";

export class RetrievalRequiredError extends Error {
  readonly code = "retrieval_required";
  constructor(message = "RAC retrieval required but failed") {
    super(message);
    this.name = "RetrievalRequiredError";
  }
}

export interface ResolveContextInput {
  mode: ComposerMode;
  workspaceId: number;
  agentId: number;
  agentDraftId: number;
  actorId: number;
  /**
   * Most recent user message — the retrieval query. When empty (e.g.
   * a turn with only system content), retrieval is skipped to save
   * latency.
   */
  query?: string;
  /**
   * RAC profile key to retrieve under. Default: `"default"`. When the
   * draft has no profile by this key, retrieval is skipped and the
   * orchestrator returns CAG-only.
   */
  profileKey?: string;
}

export interface RuntimeTraceMetrics {
  cagPackId: number | null;
  cagPackVersion: number | null;
  retrievalEnabled: boolean;
  retrievalLatencyMs: number;
  perSourceLatencyMs: Record<number, number>;
  chunksReturned: number;
  chunksFiltered: number;
  chunksIncluded: number;
  truncatedByBudget: number;
  fallbackReason: string | null;
  /** U5-b.3: per-trace counter of PII-blocked chunks (subset of chunksFiltered). */
  piiBlockedCount: number;
  /** U5-b.3: per-trace counter of license-blocked chunks (subset of chunksFiltered). */
  licenseBlockedCount: number;
}

/**
 * Per-source executor results passed through to the P7 trace writer
 * so it can build the `ags_rac_context_blocks` rows. The orchestrator
 * doesn't reshape this — it's the executor's `perSource` projection
 * unchanged, plus the included chunks the assembler retained.
 */
export interface RuntimeSourceTrace {
  perSource: ExecutedSourceResult[];
  /** Chunks the assembler kept in the rendered evidence (ordered by score DESC). */
  includedChunks: RacRetrievalChunk[];
  /** Map of `sourceChunkId` → which source it came from, for the per-block trace rows. */
  chunkSourceMap: Record<string, { sourceId: number; sourceType: string }>;
}

export interface ResolvedContext {
  capabilityPack: SystemPromptSection | null;
  retrievalEvidence: SystemPromptSection | null;
  /** All warnings (CAG + planner + executor + filter + assembler), prefixed with stage. */
  warnings: string[];
  /** P7 trace will persist this; emitted today as a structured object. */
  trace: RuntimeTraceMetrics;
  /** Per-source executor results + assembled chunks for P7 context-block rows. */
  sourceTrace: RuntimeSourceTrace;
}

const PROFILE_KEY_DEFAULT = "default";

/**
 * Resolve CAG pack + retrieval evidence for one runtime turn. Pure
 * orchestration over P1C/P2/P4/P5 primitives — no Model Access call,
 * no MCP dispatcher, no chat-state mutation.
 */
export async function resolveAndAssembleContext(
  input: ResolveContextInput,
): Promise<ResolvedContext> {
  const warnings: string[] = [];
  const trace: RuntimeTraceMetrics = {
    cagPackId: null,
    cagPackVersion: null,
    retrievalEnabled: false,
    retrievalLatencyMs: 0,
    perSourceLatencyMs: {},
    chunksReturned: 0,
    chunksFiltered: 0,
    chunksIncluded: 0,
    truncatedByBudget: 0,
    fallbackReason: null,
    piiBlockedCount: 0,
    licenseBlockedCount: 0,
  };
  const sourceTrace: RuntimeSourceTrace = {
    perSource: [],
    includedChunks: [],
    chunkSourceMap: {},
  };

  // ── CAG (P1C) ───────────────────────────────────────────────────
  let capabilityPack: SystemPromptSection | null = null;
  try {
    const resolved = await resolveCagPack({
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      agentDraftId: input.agentDraftId,
      actorId: input.actorId,
      mode: input.mode,
    });
    capabilityPack = resolved.section;
    trace.cagPackId = resolved.pack?.id ?? null;
    trace.cagPackVersion = resolved.pack?.packVersion ?? null;
    for (const w of resolved.warnings) warnings.push(`cag: ${w}`);
  } catch (err) {
    if (err instanceof CagRequiredError) throw err;
    warnings.push(`cag: orchestrator caught ${(err as Error).message}; capabilityPack=null`);
    trace.fallbackReason = "cag_resolver_error";
  }

  // ── Retrieval (P4 + P5) ────────────────────────────────────────
  // Mode=disabled skips retrieval entirely (composer ignores the slot).
  if (input.mode === "disabled") {
    return { capabilityPack, retrievalEvidence: null, warnings, trace, sourceTrace };
  }

  // Skip when there's no query text — the planner would fan zero
  // adapter calls anyway, but explicit short-circuit saves the
  // profile lookup and keeps the trace clean.
  if (!input.query || input.query.trim().length === 0) {
    trace.fallbackReason ??= "no_query";
    return { capabilityPack, retrievalEvidence: null, warnings, trace, sourceTrace };
  }

  const profileKey = input.profileKey ?? PROFILE_KEY_DEFAULT;
  const profile = (await listProfilesForDraft(input.agentDraftId)).find(
    (p) => p.profileKey === profileKey && p.enabled,
  );

  if (!profile) {
    // No RAC profile registered for this draft — retrieval simply
    // doesn't run. This is the common case for agents that haven't
    // opted in to retrieval, so emit a soft note rather than a
    // warning that would noise up the trace.
    trace.fallbackReason ??= "no_profile";
    return { capabilityPack, retrievalEvidence: null, warnings, trace, sourceTrace };
  }

  trace.retrievalEnabled = true;

  let plan: RetrievalPlan;
  let executed: ExecutedRetrieval;
  let evidence: SystemPromptSection | null = null;

  try {
    plan = await planRetrieval({
      workspaceId: input.workspaceId,
      profileId: profile.id,
    });
    for (const w of plan.warnings) warnings.push(`plan: ${w}`);

    executed = await executeRetrieval({
      plan,
      query: input.query,
    });
    trace.retrievalLatencyMs = executed.totalLatencyMs;
    trace.chunksReturned = executed.chunks.length;
    sourceTrace.perSource = executed.perSource;
    for (const r of executed.perSource) {
      trace.perSourceLatencyMs[r.sourceId] = r.latencyMs;
      for (const c of r.chunks) {
        sourceTrace.chunkSourceMap[c.sourceChunkId] = {
          sourceId: r.sourceId,
          sourceType: r.sourceType,
        };
      }
    }
    for (const w of executed.warnings) warnings.push(`exec: ${w}`);

    const policy = await getPolicyForProfile(profile.id);
    const filtered = filterRetrieval({
      chunks: executed.chunks,
      policy,
    });
    const filteredOut =
      filtered.rejectionCounts.citationRequired +
      filtered.rejectionCounts.belowMinScore +
      filtered.rejectionCounts.freshness +
      filtered.rejectionCounts.duplicate +
      filtered.rejectionCounts.capacity +
      filtered.rejectionCounts.piiBlocked +
      filtered.rejectionCounts.licenseBlocked;
    trace.chunksFiltered = filteredOut;
    trace.piiBlockedCount = filtered.rejectionCounts.piiBlocked;
    trace.licenseBlockedCount = filtered.rejectionCounts.licenseBlocked;
    for (const w of filtered.warnings) warnings.push(`filter: ${w}`);

    const assembled = assembleRetrievalEvidence({
      chunks: filtered.chunks,
      warnings: [],
    });
    evidence = assembled.section;
    sourceTrace.includedChunks = assembled.included;
    trace.chunksIncluded = assembled.includedChunks;
    trace.truncatedByBudget = assembled.droppedByBudget;
    for (const w of assembled.warnings) warnings.push(`assembler: ${w}`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (input.mode === "strict") {
      throw new RetrievalRequiredError(
        `RAC retrieval failed in strict mode: ${detail}`,
      );
    }
    warnings.push(`retrieval: failed (${detail}); proceeding without evidence`);
    trace.fallbackReason ??= "retrieval_error";
    evidence = null;
  }

  return {
    capabilityPack,
    retrievalEvidence: evidence,
    warnings,
    trace,
    sourceTrace,
  };
}

/**
 * Convenience wrapper that combines `resolveAndAssembleContext` with
 * `composeSystemPrompt`. Used by chat-stream / chat / test-run-binding
 * so the runtime files don't repeat the compose call.
 *
 * Throws the same errors the orchestrator throws (`CagRequiredError`,
 * `RetrievalRequiredError`) — callers handle them per their UX.
 */
export async function buildRuntimeSystemPrompt(
  input: ResolveContextInput & {
    draft: SystemPromptInput["draft"];
  },
): Promise<{
  systemPrompt: string;
  context: ResolvedContext;
  composerWarnings: string[];
  truncations: ReturnType<typeof composeSystemPrompt>["truncations"];
  cacheKey: string;
}> {
  const context = await resolveAndAssembleContext(input);
  const composed = composeSystemPrompt({
    mode: input.mode,
    draft: input.draft,
    capabilityPack: context.capabilityPack,
    retrievalEvidence: context.retrievalEvidence,
  });
  return {
    systemPrompt: composed.text,
    context,
    composerWarnings: composed.warnings,
    truncations: composed.truncations,
    cacheKey: composed.cacheKey,
  };
}
