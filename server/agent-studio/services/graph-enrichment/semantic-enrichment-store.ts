/**
 * Semantic Enrichment store — T-D.3.1 skeleton (factory-throws placeholder).
 *
 * ASDB persistence boundary for:
 *   - ags_semantic_enrichment_runs (run lifecycle)
 *   - ags_semantic_enrichment_proposals (per-proposal rows)
 *   - ags_semantic_enrichment_decisions (approval/reject decisions)
 *
 * Flipped in T-D.3.2.
 *
 * Hard rules:
 *   - No neo4j-driver import. Persistence is Postgres-only; graph
 *     mutation runs through the T-D.4 approve-and-apply chain.
 */

import type {
  SemanticEnrichmentProposal,
  SemanticEnrichmentRunInput,
  SemanticEnrichmentRunOutput,
} from "./contracts.js";

export interface SemanticEnrichmentStore {
  beginRun(input: SemanticEnrichmentRunInput): Promise<{ readonly runId: number; readonly startedAt: Date }>;

  recordProposal(
    runId: number,
    proposal: SemanticEnrichmentProposal,
  ): Promise<{ readonly proposalId: number }>;

  recordRejectedBelowThreshold(
    runId: number,
    proposal: SemanticEnrichmentProposal,
  ): Promise<void>;

  finishRun(
    runId: number,
    summary: {
      readonly proposalsCreated: number;
      readonly proposalsRejectedBelowThreshold: number;
      readonly status: SemanticEnrichmentRunOutput["status"];
      readonly completedAt: Date;
    },
  ): Promise<void>;
}

export interface CreateSemanticEnrichmentStoreOptions {
  readonly db: unknown;
}

export function createSemanticEnrichmentStore(
  _options: CreateSemanticEnrichmentStoreOptions,
): SemanticEnrichmentStore {
  return {
    async beginRun() {
      throw new Error(
        "[T-D.3.1] createSemanticEnrichmentStore — beginRun placeholder; wired in T-D.3.2",
      );
    },
    async recordProposal() {
      throw new Error(
        "[T-D.3.1] createSemanticEnrichmentStore — recordProposal placeholder; wired in T-D.3.2",
      );
    },
    async recordRejectedBelowThreshold() {
      throw new Error(
        "[T-D.3.1] createSemanticEnrichmentStore — recordRejectedBelowThreshold placeholder; wired in T-D.3.2",
      );
    },
    async finishRun() {
      throw new Error(
        "[T-D.3.1] createSemanticEnrichmentStore — finishRun placeholder; wired in T-D.3.2",
      );
    },
  };
}
