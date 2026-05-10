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

/**
 * L4-c8 (cycle-8 audit closure §L4-c8) — namespace boundary note.
 *
 * The `code` field on this class lives in the ORCHESTRATION-error
 * code namespace, NOT the dispatch-error namespace. Three classes
 * use the field name `code` and their values come from disjoint
 * value spaces — a future error-mapping helper that conflates them
 * would silently route the wrong way:
 *
 *   - `RetrievalRequiredError.code: "retrieval_required"`
 *   - `CagRequiredError.code: "cag_required"`
 *     ↳ Both surface from the orchestrator / composer pipeline.
 *       SSE mapper at chat-stream.ts emits these as the SSE error
 *       `code` field. UI layer pattern-matches on these strings.
 *
 *   - `McpError.code` / `DispatchErrorCode` (e.g. `validator_rejected`,
 *     `governance_denied`, `internal_error`)
 *     ↳ Surface from the MCP dispatcher. Operator audit ledger
 *       (agsRuntimePolicyEvents) keys off these. UI tool-call
 *       failure surface keys off these.
 *
 * The two namespaces are NOT mergeable — any helper that types both
 * as `string` and pattern-matches across them silently violates the
 * boundary. If a future PR introduces a unified error-mapping
 * helper, it MUST type the input as a discriminated union with the
 * namespace as the discriminator (e.g. `OrchestrationCode | DispatchCode`).
 *
 * Mirrors cycle-7 H3-c7 (sandbox vs. dispatch error code namespaces)
 * and M7-c8 (registry pattern for orchestration errors, deferred to
 * a follow-up).
 *
 * Lockstep: pinned by tests/agent-studio/l1-l4-c8-doc-bundle.test.ts.
 */
export class RetrievalRequiredError extends Error {
  readonly code = "retrieval_required";
  constructor(message = "RAC retrieval required but failed") {
    super(message);
    this.name = "RetrievalRequiredError";
  }
}

/**
 * M1-c8 (cycle-8 audit `/sdcard/Download/RAC_ORCHESTRATOR_AUDIT_2026-05-09.md`
 * §M1-c8) — typed discriminated union for fallback reasons.
 *
 * Pre-cycle-8 the trace's `fallbackReason` was free-form `string`,
 * so a typo (`"no_profle"`) compiled silently and broke operator
 * filtering with no compile-time signal. Mirrors cycle-7 M8-c7's
 * `TransportErrorCode` taxonomy. New reasons MUST be added to this
 * union (typescript catches the omission at every call site).
 */
export type FallbackReason =
  | "no_query"
  | "no_profile"
  | "cag_resolver_error"
  | "retrieval_error";

export interface ResolveContextInput {
  mode: ComposerMode;
  workspaceId: number;
  agentId: number;
  agentDraftId: number;
  actorId: number;
  /**
   * Most recent user message — the retrieval query.
   *
   * **M4-c8 (cycle-8 audit closure §M4-c8) — empty-string semantic.**
   * When this field is empty (`""` or undefined), retrieval is
   * SKIPPED ENTIRELY (not "use default query"). Callers passing
   * `userMessage ?? ""` when userMessage is undefined silently
   * disable retrieval — the orchestrator emits a warning entry
   * (M2-c8) so the disable is operator-visible, but the field's
   * semantic is still surprising. Callers that need retrieval to
   * always run should pass a synthesized query (e.g., the agent's
   * mission statement) rather than relying on default behavior.
   */
  query?: string;
  /**
   * RAC profile key to retrieve under. Default: `"default"`. When the
   * draft has no profile by this key, retrieval is skipped and the
   * orchestrator returns CAG-only.
   */
  profileKey?: string;
  /**
   * M8-c8 (cycle-8 audit closure §M8-c8) — runtime run id (typically
   * the chat session id) threaded into the CAG resolver so its
   * event-log write failures can fall back to a durable
   * `agsRuntimePolicyEvents` row instead of a stdout-only breadcrumb.
   * Optional because direct callers (tests, future background
   * recompiles) may not have a run id; the resolver's helper falls
   * back to structured stdout when absent.
   */
  runtimeRunId?: number | null;
}

export interface RuntimeTraceMetrics {
  cagPackId: number | null;
  cagPackVersion: number | null;
  retrievalEnabled: boolean;
  retrievalLatencyMs: number;
  /**
   * L2-c8 (cycle-8 audit closure §L2-c8) — known-limitation marker.
   *
   * Per-source latency map keyed by `agsRacSources.id`. UNBOUNDED in
   * size by design — a workspace with thousands of sources would
   * serialize a correspondingly large map into the trace row. In
   * practice typical workspaces have <20 sources, so this hasn't
   * surfaced as a real issue.
   *
   * If it ever does (operator reports trace rows >1MB, slow trace
   * inserts on huge workspaces), fold into the cycle-7-style ceiling
   * pattern: cap at MAX_PER_SOURCE_TRACE_ENTRIES (e.g. 100), record
   * a truncation flag in the trace row, surface in operator UI.
   * Pure documentation for now — no enforcement layer.
   *
   * Lockstep: pinned by tests/agent-studio/l1-l4-c8-doc-bundle.test.ts.
   */
  perSourceLatencyMs: Record<number, number>;
  chunksReturned: number;
  chunksFiltered: number;
  chunksIncluded: number;
  truncatedByBudget: number;
  /**
   * M3-c8 + M1-c8: PRIMARY (first) fallback reason encountered in
   * this turn. Renamed from `fallbackReason` to make the
   * "first-only" semantic explicit. The full cascade lives in
   * `fallbackReasons`. Operator UI keys off this field for the
   * principal cause; forensics use `fallbackReasons` for the chain.
   */
  primaryFallbackReason: FallbackReason | null;
  /**
   * M3-c8 (cycle-8 audit closure §M3-c8) — full cascade of fallback
   * reasons in the order they fired. Pre-cycle-8 the orchestrator
   * used `??=` to record only the FIRST reason, losing causality on
   * multi-fallback turns (e.g., both CAG and retrieval failing).
   * The array preserves the chain so operators can reconstruct the
   * cascade without re-running the turn.
   */
  fallbackReasons: FallbackReason[];
  /**
   * M9-c8 (cycle-8 audit closure §M9-c8) — free-form detail string
   * for the PRIMARY fallback. Pre-cycle-8 the bucket
   * (`retrieval_error`) was recorded but the underlying error
   * detail (`timeout` vs `adapter_error` vs `validation_error`)
   * was discarded. Mirrors cycle-7 H3-c7's `sandboxErrorCode`
   * pattern (typed bucket alongside free-form context).
   */
  primaryFallbackDetail: string | null;
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
 * M2-c8 + M3-c8 + M9-c8: helper that records a fallback into the
 * trace AND emits a warning entry. Replaces the pre-cycle-8 inline
 * `trace.fallbackReason ??= "..."` pattern which:
 *   1. Lost causality on multi-fallback turns (`??=` only records
 *      the first), and
 *   2. Skipped the warning emit on `no_query` / `no_profile` paths
 *      (silent disables, breaking the operator-visible-degradation
 *      contract).
 *
 * The first call sets `primaryFallbackReason` + `primaryFallbackDetail`;
 * subsequent calls APPEND to `fallbackReasons` so the cascade is
 * preserved. EVERY fallback emits a warning (uniform contract).
 */
function recordFallback(
  trace: RuntimeTraceMetrics,
  warnings: string[],
  reason: FallbackReason,
  detail: string,
): void {
  if (trace.primaryFallbackReason === null) {
    trace.primaryFallbackReason = reason;
    trace.primaryFallbackDetail = detail;
  }
  trace.fallbackReasons.push(reason);
  warnings.push(`fallback: ${reason} (${detail})`);
}

/**
 * H4-c8 (cycle-8 audit closure §H4-c8) — collapse repeated warnings
 * before the caller emits them. Pre-cycle-8 a workspace with N
 * sources could produce N+ "source skipped" warnings per turn, each
 * `console.info`'d separately by the chat flows. The result was
 * stdout flooding under chat-volume load.
 *
 * The dedup is INTRA-TURN (per-call), not cross-turn: the
 * orchestrator's warnings array is rebuilt every turn, so the
 * collapse only runs across the warnings collected during ONE
 * orchestration. Repeated reasons within the turn are grouped to
 * `<reason> (xN)`; unique reasons pass through unchanged.
 *
 * The "reason key" is the prefix-up-to-first-colon (`plan:`,
 * `exec:`, `cag:`, `assembler:`, `filter:`, `fallback:`) plus the
 * first 40 characters of the message body. Distinct details within
 * the same prefix collapse separately (so "plan: no embedding for
 * source 1" and "plan: no embedding for source 2" stay distinct
 * while three identical "plan: source disabled" lines collapse).
 */
export function dedupeWarnings(warnings: string[]): string[] {
  const counts = new Map<string, { sample: string; count: number; firstIdx: number }>();
  warnings.forEach((w, idx) => {
    const head = w.slice(0, 80);
    const existing = counts.get(head);
    if (existing) {
      existing.count++;
    } else {
      counts.set(head, { sample: w, count: 1, firstIdx: idx });
    }
  });
  const ordered = Array.from(counts.values()).sort(
    (a, b) => a.firstIdx - b.firstIdx,
  );
  return ordered.map((entry) =>
    entry.count > 1 ? `${entry.sample} (x${entry.count})` : entry.sample,
  );
}

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
    primaryFallbackReason: null,
    fallbackReasons: [],
    primaryFallbackDetail: null,
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
      // M8-c8: thread the runtime run id so the resolver's event-log
      // failure path can write a durable audit row.
      runtimeRunId: input.runtimeRunId,
    });
    capabilityPack = resolved.section;
    trace.cagPackId = resolved.pack?.id ?? null;
    trace.cagPackVersion = resolved.pack?.packVersion ?? null;
    for (const w of resolved.warnings) warnings.push(`cag: ${w}`);
  } catch (err) {
    if (err instanceof CagRequiredError) throw err;
    const detail = err instanceof Error ? err.message : String(err);
    warnings.push(`cag: orchestrator caught ${detail}; capabilityPack=null`);
    recordFallback(trace, warnings, "cag_resolver_error", detail);
  }

  // ── Retrieval (P4 + P5) ────────────────────────────────────────
  // Mode=disabled skips retrieval entirely (composer ignores the slot).
  if (input.mode === "disabled") {
    return { capabilityPack, retrievalEvidence: null, warnings, trace, sourceTrace };
  }

  // M2-c8: skip when there's no query text. Pre-cycle-8 this path
  // silently set the fallback reason without emitting a warning;
  // post-cycle-8 the warning is uniform with every other fallback
  // path so callers checking `warnings.length > 0` see the
  // degradation. The empty-query case is documented on the
  // ResolveContextInput.query field per M4-c8.
  if (!input.query || input.query.trim().length === 0) {
    recordFallback(trace, warnings, "no_query", "query is empty or whitespace-only");
    return { capabilityPack, retrievalEvidence: null, warnings, trace, sourceTrace };
  }

  const profileKey = input.profileKey ?? PROFILE_KEY_DEFAULT;
  const profile = (await listProfilesForDraft(input.agentDraftId)).find(
    (p) => p.profileKey === profileKey && p.enabled,
  );

  if (!profile) {
    // M2-c8: no RAC profile registered for this draft. Pre-cycle-8
    // this path was a silent fallback ("common case, don't noise
    // up the trace"); post-cycle-8 the warning is uniform — every
    // degraded path leaves a discoverable breadcrumb. The H4-c8
    // dedup logic collapses repeats so high-volume agents don't
    // spam the trace with the same "no_profile" line.
    recordFallback(
      trace,
      warnings,
      "no_profile",
      `no enabled RAC profile with key=${profileKey} for draft=${input.agentDraftId}`,
    );
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
    recordFallback(trace, warnings, "retrieval_error", detail);
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
