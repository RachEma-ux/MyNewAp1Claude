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
 * Candidate target the agent should consider for enrichment.
 * The caller (cron orchestrator or operator-triggered tRPC) is
 * responsible for selecting these — typically nodes flagged as
 * "weak description" by a graph-quality scanner, or recently
 * ingested nodes lacking descriptions.
 */
export interface SemanticEnrichmentCandidate {
  readonly targetTypeKey: string;
  readonly targetId: number;
  readonly proposalKind: SemanticEnrichmentProposalKind;
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
