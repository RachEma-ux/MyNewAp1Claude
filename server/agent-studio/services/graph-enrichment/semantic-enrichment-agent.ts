/**
 * Semantic Enrichment Agent — T-D.3.5 wire-up.
 *
 * Composes the four boundary primitives (store + evidence collector
 * + proposer) into the public `SemanticEnrichmentAgent.run(input)`
 * lifecycle. This is the final T-D.3 slice that closes the
 * audit-confirmed gap: tables previously existed but no runtime
 * wrote to them.
 *
 * Run lifecycle:
 *   1. store.beginRun(input) → runId + startedAt
 *   2. For each candidate target (passed in via `input.candidates`):
 *      a. evidenceCollector.collect → citations
 *      b. If zero citations: skip (no source-backed proposal possible)
 *      c. proposer.propose → SemanticEnrichmentProposal
 *      d. Threshold gate (minConfidence, default 0.8):
 *         - confidence < threshold → recordRejectedBelowThreshold (audit)
 *         - confidence ≥ threshold → recordProposal (pending)
 *      e. Cap at maxProposals — stop creating once reached
 *   3. store.finishRun with status='completed' (or 'failed' on
 *      unhandled error) + counts + completedAt
 *
 * Error policy:
 *   - Per-candidate failures (provider rate-limit, parse error)
 *     are caught and recorded as a "skipped" tally, the loop
 *     continues. The store DOES NOT get a row per skip — operators
 *     see them only in the agent log.
 *   - Unhandled errors (store insert failure, contract violation)
 *     surface to the caller with status='failed' written to the run.
 *
 * Hard rules:
 *   - Agent emits proposals ONLY. Mutation lives in T-D.4
 *     approve-and-apply chain (agsGraphCorrectionProposals).
 *   - Workspace-scoped: every candidate / citation read is
 *     workspaceId-gated by the boundary primitives.
 *   - No direct LLM / DB / graph access — composition only.
 */

import type {
  SemanticEnrichmentRunInput,
  SemanticEnrichmentRunOutput,
  SemanticEnrichmentProposalKind,
} from "./contracts.js";
import {
  normalizeSemanticEnrichmentMaxProposals,
  normalizeSemanticEnrichmentMinConfidence,
} from "./contracts.js";
import type { SemanticEnrichmentStore } from "./semantic-enrichment-store.js";
import type { SemanticEnrichmentEvidenceCollector } from "./semantic-enrichment-evidence-collector.js";
import type { SemanticEnrichmentProposer } from "./semantic-enrichment-proposer.js";

/**
 * Closed taxonomy for the candidate's target shape — T-D.3.δ-followup α.
 *
 * Discriminator the agent + downstream consumers branch on. Today only
 * `"node"` candidates exist in production (the 2 wired selectors). The
 * other three variants are reserved for the 2026-05-18 selector
 * follow-ups (β/γ/δ):
 *
 *   - `"node_property"` → stale_fact_refresh (per-property tuple)
 *   - `"entity"`        → entity_disambiguation (entity row, not a node)
 *   - `"edge"`          → relationship_label_repair (edge row)
 *
 * Extending the taxonomy is a 2-place change: add to the literal array,
 * add the matching variant interface below. Source-scan-tested.
 */
export const SEMANTIC_ENRICHMENT_CANDIDATE_TARGET_KINDS = [
  "node",
  "node_property",
  "entity",
  "edge",
] as const;

export type SemanticEnrichmentCandidateTargetKind =
  (typeof SEMANTIC_ENRICHMENT_CANDIDATE_TARGET_KINDS)[number];

/**
 * Common fields across all candidate variants. Every variant carries
 * a `targetTypeKey` + `targetId` so the existing agent loop
 * (`candidate.targetTypeKey`, `candidate.targetId`) keeps working
 * unchanged on the call paths it owns; downstream consumers narrow on
 * `targetKind` when they need variant-specific fields.
 */
export interface SemanticEnrichmentCandidateBase {
  readonly targetTypeKey: string;
  readonly targetId: number;
  readonly proposalKind: SemanticEnrichmentProposalKind;
}

export interface SemanticEnrichmentNodeCandidate
  extends SemanticEnrichmentCandidateBase {
  readonly targetKind: "node";
}

/**
 * `stale_fact_refresh` target — a (nodeId, propertyKey) tuple where the
 * source-note version backing the property has been superseded by a
 * newer revision. The `propertyKey` lives on the candidate so the
 * evidence collector + proposer can target the specific property
 * without re-querying the ontology.
 */
export interface SemanticEnrichmentNodePropertyCandidate
  extends SemanticEnrichmentCandidateBase {
  readonly targetKind: "node_property";
  readonly propertyKey: string;
}

/**
 * `entity_disambiguation` target — a row in `ags_graph_entities`, NOT
 * a node. `targetTypeKey` carries the entity's `entity_type`;
 * `targetId` carries the entity row id.
 */
export interface SemanticEnrichmentEntityCandidate
  extends SemanticEnrichmentCandidateBase {
  readonly targetKind: "entity";
}

/**
 * `relationship_label_repair` target — a row in `ags_graph_edges`,
 * NOT a node. `targetTypeKey` carries the edge's current (generic)
 * type_key (e.g., `RELATED_TO`); `targetId` carries the edge row id.
 */
export interface SemanticEnrichmentEdgeCandidate
  extends SemanticEnrichmentCandidateBase {
  readonly targetKind: "edge";
}

/**
 * Candidate target the agent should consider for enrichment.
 * The caller (cron orchestrator or operator-triggered tRPC) is
 * responsible for selecting these — typically nodes flagged as
 * "weak description" by a graph-quality scanner, or recently
 * ingested nodes lacking descriptions.
 *
 * **T-D.3.δ-followup α — discriminated union by `targetKind`.** Today
 * only `"node"` candidates are produced (the 2 wired selectors —
 * `description_enrichment`, `missing_property_fill`). The other three
 * variants exist to unblock per-kind selector PRs that produce them.
 */
export type SemanticEnrichmentCandidate =
  | SemanticEnrichmentNodeCandidate
  | SemanticEnrichmentNodePropertyCandidate
  | SemanticEnrichmentEntityCandidate
  | SemanticEnrichmentEdgeCandidate;

export function isSemanticEnrichmentCandidateTargetKind(
  s: unknown,
): s is SemanticEnrichmentCandidateTargetKind {
  return (
    typeof s === "string" &&
    (SEMANTIC_ENRICHMENT_CANDIDATE_TARGET_KINDS as ReadonlyArray<string>).includes(
      s,
    )
  );
}

export interface SemanticEnrichmentRunInputWithCandidates
  extends SemanticEnrichmentRunInput {
  /**
   * Targets the agent should consider this run. Empty → no work.
   * The caller selects these to keep the agent's run shape
   * deterministic + bounded.
   */
  readonly candidates?: ReadonlyArray<SemanticEnrichmentCandidate>;
}

export interface SemanticEnrichmentRunOutputWithSkips
  extends SemanticEnrichmentRunOutput {
  readonly candidatesSkippedNoCitations: number;
  readonly candidatesSkippedProposerError: number;
}

export interface SemanticEnrichmentAgent {
  run(
    input: SemanticEnrichmentRunInputWithCandidates,
  ): Promise<SemanticEnrichmentRunOutputWithSkips>;
}

export interface CreateSemanticEnrichmentAgentOptions {
  readonly store: SemanticEnrichmentStore;
  readonly evidenceCollector: SemanticEnrichmentEvidenceCollector;
  readonly proposer: SemanticEnrichmentProposer;
}

export function createSemanticEnrichmentAgent(
  options: CreateSemanticEnrichmentAgentOptions,
): SemanticEnrichmentAgent {
  return {
    async run(input) {
      const candidates = input.candidates ?? [];
      const maxProposals = normalizeSemanticEnrichmentMaxProposals(
        input.maxProposals,
      );
      const minConfidence = normalizeSemanticEnrichmentMinConfidence(
        input.minConfidence,
      );

      const { runId, startedAt } = await options.store.beginRun(input);
      let proposalsCreated = 0;
      let proposalsRejectedBelowThreshold = 0;
      let candidatesSkippedNoCitations = 0;
      let candidatesSkippedProposerError = 0;
      let status: SemanticEnrichmentRunOutput["status"] = "completed";

      try {
        for (const candidate of candidates) {
          if (proposalsCreated >= maxProposals) break;

          const citations = await options.evidenceCollector.collect({
            workspaceId: input.workspaceId,
            targetTypeKey: candidate.targetTypeKey,
            targetId: candidate.targetId,
          });
          if (citations.length === 0) {
            candidatesSkippedNoCitations++;
            continue;
          }

          let proposal;
          try {
            proposal = await options.proposer.propose({
              workspaceId: input.workspaceId,
              targetTypeKey: candidate.targetTypeKey,
              targetId: candidate.targetId,
              proposalKind: candidate.proposalKind,
              citations,
            });
          } catch (_err) {
            candidatesSkippedProposerError++;
            continue;
          }

          if (proposal.confidence < minConfidence) {
            await options.store.recordRejectedBelowThreshold(runId, proposal);
            proposalsRejectedBelowThreshold++;
            continue;
          }

          await options.store.recordProposal(runId, proposal);
          proposalsCreated++;
        }
      } catch (_unhandled) {
        status = "failed";
      }

      const completedAt = new Date();
      await options.store.finishRun(runId, {
        proposalsCreated,
        proposalsRejectedBelowThreshold,
        status,
        completedAt,
      });

      return {
        runId,
        proposalsCreated,
        proposalsRejectedBelowThreshold,
        candidatesSkippedNoCitations,
        candidatesSkippedProposerError,
        status,
        startedAt,
        completedAt,
      };
    },
  };
}
