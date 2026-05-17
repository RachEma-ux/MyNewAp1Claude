/**
 * Semantic Enrichment Agent — T-D.3.1 skeleton (factory-throws placeholder).
 *
 * The LLM-driven proposer that converts graph-quality findings (or
 * directly identified weak descriptions) into source-backed
 * `GraphCorrectionProposal` rows. Subsequent T-D.3.x slices flip the
 * placeholder for the real runtime:
 *
 *   - T-D.3.2 → store wired to ASDB persistence
 *   - T-D.3.3 → evidence collector wired to source-note queries
 *   - T-D.3.4 → LLM proposer wired via OpenRouter Model Access
 *
 * Hard rules:
 *   - LLM calls ONLY via OpenRouter Model Access boundary.
 *   - No direct openrouter / process.env / dispatchMcpToolCall imports.
 *   - Agent emits proposals ONLY; mutation lives in T-D.4 chain.
 */

import type {
  SemanticEnrichmentRunInput,
  SemanticEnrichmentRunOutput,
} from "./contracts.js";
import type { SemanticEnrichmentStore } from "./semantic-enrichment-store.js";
import type { SemanticEnrichmentEvidenceCollector } from "./semantic-enrichment-evidence-collector.js";
import type { SemanticEnrichmentProposer } from "./semantic-enrichment-proposer.js";

export interface SemanticEnrichmentAgent {
  run(input: SemanticEnrichmentRunInput): Promise<SemanticEnrichmentRunOutput>;
}

export interface CreateSemanticEnrichmentAgentOptions {
  readonly store: SemanticEnrichmentStore;
  readonly evidenceCollector: SemanticEnrichmentEvidenceCollector;
  readonly proposer: SemanticEnrichmentProposer;
}

export function createSemanticEnrichmentAgent(
  _options: CreateSemanticEnrichmentAgentOptions,
): SemanticEnrichmentAgent {
  return {
    async run(_input) {
      throw new Error(
        "[T-D.3.1] createSemanticEnrichmentAgent — agent runtime placeholder; wired in T-D.3.4",
      );
    },
  };
}
