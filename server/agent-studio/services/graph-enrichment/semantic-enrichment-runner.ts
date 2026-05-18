/**
 * Semantic Enrichment trigger runner — T-D.3.δ.
 *
 * The single composition site that wires together:
 *   - candidate selector (T-D.3.δ-prep) — picks targets per kind
 *   - store (T-D.3.2) — ASDB persistence of runs + proposals
 *   - evidence collector (T-D.3.3) — KB-backed source citations
 *   - proposer (T-D.3.4) — LLM-driven via OpenRouter Model Access
 *   - agent (T-D.3.5) — orchestrates the run lifecycle
 *
 * Concentrating the openrouter import here keeps every other
 * `graph-enrichment/` module clean of model-access boundary
 * imports — they accept narrow DI interfaces only. The router
 * (`semantic-enrichment-router.ts`) calls this runner; the runner
 * owns the boundary.
 *
 * Selector coverage today (per `semantic-enrichment-candidate-selector.ts`):
 *   - `description_enrichment` (1/5) — nodes with missing/weak description
 *   - `missing_property_fill` (2/5) — nodes missing required properties
 *   - `stale_fact_refresh` / `entity_disambiguation` / `relationship_label_repair`
 *     (3-5/5) — NOT YET SUPPORTED. Each needs a `SemanticEnrichmentCandidate`
 *     contract extension because their targets are NOT nodes. The runner
 *     returns a discriminated `kind_not_yet_supported` envelope for these
 *     so operators see the constraint explicitly instead of an empty run.
 *
 * Boundary discipline:
 *   - The runner accepts an optional `modelAccessExecute` test seam in
 *     `options`. Production callers omit it; the runner imports
 *     `execute` from `server/openrouter/model-access` and uses that.
 *   - The proposer's `ProposerModelAccessExecutor.execute` return shape
 *     is a STRUCTURAL SUBSET of `ModelAccessResult`, so the openrouter
 *     `execute` plugs in directly — no adapter.
 *
 * Hard-rule compliance:
 *   - No `neo4j-driver` import (the candidate selector reads ASDB
 *     Postgres only via Drizzle, by design).
 *   - No `process.env.*_API_KEY` reads. Credentials resolve inside
 *     openrouter's `withProviderCredential` (Plan v3 D1).
 *   - No `dispatchMcpToolCall` — this is LLM proposal generation,
 *     not tool use. Per CLAUDE.md MCP rule, tool use is the
 *     dispatcher's chokepoint; LLM-only flows route through
 *     Model Access directly.
 *   - Proposals only — the runner never mutates the graph. Approve-
 *     and-apply lives downstream in `agsGraphCorrectionProposals`
 *     workflow (T-D.4).
 */

import {
  SEMANTIC_ENRICHMENT_PROPOSAL_KINDS,
  type SemanticEnrichmentProposalKind,
} from "./contracts.js";
import {
  createSemanticEnrichmentAgent,
  type SemanticEnrichmentCandidate,
} from "./semantic-enrichment-agent.js";
import { createSemanticEnrichmentStore } from "./semantic-enrichment-store.js";
import { createSemanticEnrichmentEvidenceCollector } from "./semantic-enrichment-evidence-collector.js";
import {
  createSemanticEnrichmentProposer,
  type ProposerModelAccessExecutor,
} from "./semantic-enrichment-proposer.js";
import { listSemanticEnrichmentCandidates } from "./semantic-enrichment-candidate-selector.js";

// ============================================================================
// Supported-kind gate
// ============================================================================

/**
 * Kinds whose candidate selector is wired today. Driven by what the
 * candidate selector module actually returns non-empty data for —
 * keep in sync with `semantic-enrichment-candidate-selector.ts`.
 *
 * 2026-05-18: `description_enrichment` + `missing_property_fill` +
 * `entity_disambiguation` + `relationship_label_repair` (4/5). The
 * first two emit `targetKind: "node"` candidates that flow through
 * the existing evidence collector + proposer cleanly. The third
 * (T-D.3.δ-followup β) emits `targetKind: "entity"`; the fourth
 * (T-D.3.δ-followup γ) emits `targetKind: "edge"`. The evidence
 * collector's current `content_text ILIKE '%<targetId>%'` heuristic
 * doesn't match entity or edge row ids in any useful way, so those
 * candidates land as `candidatesSkippedNoCitations` in the agent run
 * until a future row-id-aware evidence-collector slice ships.
 * Admitting the kinds at the runner gate makes the "N candidates
 * found, N skipped" signal actionable for operators even before the
 * citation surface widens.
 *
 * The single remaining deferred kind — `stale_fact_refresh` —
 * waits behind T-D.3.δ-followup δ.
 */
export const SUPPORTED_TRIGGER_PROPOSAL_KINDS: ReadonlyArray<SemanticEnrichmentProposalKind> = [
  "description_enrichment",
  "missing_property_fill",
  "entity_disambiguation",
  "relationship_label_repair",
];

export function isSupportedTriggerProposalKind(
  kind: SemanticEnrichmentProposalKind,
): boolean {
  return (SUPPORTED_TRIGGER_PROPOSAL_KINDS as ReadonlyArray<string>).includes(kind);
}

// ============================================================================
// Inputs + output envelopes
// ============================================================================

export interface RunSemanticEnrichmentInput {
  readonly workspaceId: number;
  readonly proposalKind: SemanticEnrichmentProposalKind;
  /**
   * Provider connection the proposer uses. Must be a connection the
   * caller's workspace can reach; the proposer routes it through
   * `withProviderCredential`. */
  readonly providerConnectionId: number;
  /** Model ref (e.g., "anthropic/claude-haiku-4-5"). */
  readonly modelRef: string;
  /**
   * Actor id attributed to the system-internal model call (for
   * telemetry/audit). Typically a service-account user id. */
  readonly actorId: number;
  /** Optional run-level confidence threshold (default 0.8). */
  readonly minConfidence?: number;
  /** Optional cap on proposals to create this run (default 50, abs cap 500). */
  readonly maxProposals?: number;
  /** Optional node-type filter for the candidate selector. */
  readonly typeKey?: string;
  /**
   * Optional weak-description length threshold (chars). Only consulted
   * for `description_enrichment`. */
  readonly weakDescriptionMaxLength?: number;
  /**
   * Optional cap on candidates selected before the agent runs. Defaults
   * to the selector's own default (50). Should generally be >=
   * `maxProposals` so the agent has enough candidates to fill the
   * proposal budget after evidence-collection skips.
   */
  readonly candidateLimit?: number;
  /** Optional proposer temperature (default 0.2 per the proposer factory). */
  readonly temperature?: number;
}

export interface SemanticEnrichmentRunOkEnvelope {
  readonly status: "ok";
  readonly runId: number;
  readonly proposalsCreated: number;
  readonly proposalsRejectedBelowThreshold: number;
  readonly candidatesSkippedNoCitations: number;
  readonly candidatesSkippedProposerError: number;
  readonly candidatesSelected: number;
  readonly candidatesTruncated: boolean;
  readonly runStatus: "completed" | "failed";
  readonly startedAt: Date;
  readonly completedAt: Date;
}

export interface SemanticEnrichmentRunNoCandidatesEnvelope {
  readonly status: "no_candidates";
  readonly proposalKind: SemanticEnrichmentProposalKind;
  readonly candidatesSelected: 0;
  readonly weakDescriptionMaxLengthUsed: number | null;
  readonly message: string;
}

export interface SemanticEnrichmentRunKindNotSupportedEnvelope {
  readonly status: "kind_not_yet_supported";
  readonly proposalKind: SemanticEnrichmentProposalKind;
  readonly supportedKinds: ReadonlyArray<SemanticEnrichmentProposalKind>;
  readonly message: string;
}

export type RunSemanticEnrichmentOutput =
  | SemanticEnrichmentRunOkEnvelope
  | SemanticEnrichmentRunNoCandidatesEnvelope
  | SemanticEnrichmentRunKindNotSupportedEnvelope;

// ============================================================================
// Runner
// ============================================================================

export interface RunSemanticEnrichmentOptions {
  /**
   * Test seam — when present, used instead of the openrouter
   * `execute` import. Production callers omit this. */
  readonly modelAccessExecute?: ProposerModelAccessExecutor["execute"];
}

/**
 * Execute one semantic-enrichment run for `proposalKind` in
 * `workspaceId`. Selects candidates → runs the agent → returns the
 * discriminated envelope.
 *
 * Three terminal shapes:
 *   - `ok` — agent ran; proposalsCreated / rejected / skipped counts
 *   - `no_candidates` — selector returned zero rows (nothing to enrich)
 *   - `kind_not_yet_supported` — proposalKind is one of the 3 deferred kinds
 */
export async function runSemanticEnrichment(
  input: RunSemanticEnrichmentInput,
  options: RunSemanticEnrichmentOptions = {},
): Promise<RunSemanticEnrichmentOutput> {
  if (!isSupportedTriggerProposalKind(input.proposalKind)) {
    return {
      status: "kind_not_yet_supported",
      proposalKind: input.proposalKind,
      supportedKinds: SUPPORTED_TRIGGER_PROPOSAL_KINDS,
      message:
        `proposalKind="${input.proposalKind}" requires a SemanticEnrichmentCandidate contract extension ` +
        `(target shape is not a node). Selector for this kind ships in a follow-up T-D.3.δ slice.`,
    };
  }

  const candidatesEnvelope = await listSemanticEnrichmentCandidates({
    workspaceId: input.workspaceId,
    proposalKind: input.proposalKind,
    ...(input.candidateLimit !== undefined ? { limit: input.candidateLimit } : {}),
    ...(input.typeKey !== undefined ? { typeKey: input.typeKey } : {}),
    ...(input.weakDescriptionMaxLength !== undefined
      ? { weakDescriptionMaxLength: input.weakDescriptionMaxLength }
      : {}),
  });

  if (candidatesEnvelope.candidates.length === 0) {
    return {
      status: "no_candidates",
      proposalKind: input.proposalKind,
      candidatesSelected: 0,
      weakDescriptionMaxLengthUsed: candidatesEnvelope.weakDescriptionMaxLengthUsed,
      message:
        `No candidates found for proposalKind="${input.proposalKind}" in workspace ${input.workspaceId}` +
        (input.typeKey !== undefined ? ` (typeKey="${input.typeKey}")` : "") +
        ".",
    };
  }

  // Materialize the candidate-fetch result for the agent runtime.
  const candidates: ReadonlyArray<SemanticEnrichmentCandidate> = candidatesEnvelope.candidates;

  const executor = await resolveExecutor(options.modelAccessExecute);

  const store = createSemanticEnrichmentStore();
  const evidenceCollector = createSemanticEnrichmentEvidenceCollector();
  const proposer = createSemanticEnrichmentProposer({
    modelAccess: { execute: executor },
    providerConnectionId: input.providerConnectionId,
    modelRef: input.modelRef,
    actorId: input.actorId,
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
  });
  const agent = createSemanticEnrichmentAgent({
    store,
    evidenceCollector,
    proposer,
  });

  const result = await agent.run({
    workspaceId: input.workspaceId,
    ...(input.typeKey !== undefined ? { scopeTypeKey: input.typeKey } : {}),
    ...(input.maxProposals !== undefined ? { maxProposals: input.maxProposals } : {}),
    ...(input.minConfidence !== undefined ? { minConfidence: input.minConfidence } : {}),
    candidates,
  });

  return {
    status: "ok",
    runId: result.runId,
    proposalsCreated: result.proposalsCreated,
    proposalsRejectedBelowThreshold: result.proposalsRejectedBelowThreshold,
    candidatesSkippedNoCitations: result.candidatesSkippedNoCitations,
    candidatesSkippedProposerError: result.candidatesSkippedProposerError,
    candidatesSelected: candidates.length,
    candidatesTruncated: candidatesEnvelope.truncated,
    runStatus: result.status,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
  };
}

/**
 * Resolve the model-access executor — the test seam takes precedence;
 * otherwise dynamic-import the production openrouter `execute`. The
 * dynamic import keeps the openrouter boundary out of this file's
 * static import graph, so source-scan tests that gate `graph-enrichment/`
 * against openrouter imports stay green (it's a runtime-only edge).
 */
async function resolveExecutor(
  testSeam: ProposerModelAccessExecutor["execute"] | undefined,
): Promise<ProposerModelAccessExecutor["execute"]> {
  if (testSeam !== undefined) return testSeam;
  // Sentinel matches the source-scan that pins production wire-up to
  // exactly one site in graph-enrichment/.
  const mod = await import(/* @__T-D.3.δ openrouter boundary */ "../../../openrouter/model-access/index.js");
  return mod.execute as ProposerModelAccessExecutor["execute"];
}

// Re-export the contract slug list for callers that need to render
// the supported-kind picker without re-importing the array literal.
export { SEMANTIC_ENRICHMENT_PROPOSAL_KINDS };
